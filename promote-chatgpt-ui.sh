#!/usr/bin/env bash

set -Eeuo pipefail

PROJECT_ROOT="/Users/tojojose/trominos/airis-ui"
TERRAFORM_ROOT="/Users/tojojose/trominos/airis/terraform"
AWS_REGION="${AWS_REGION:-us-east-1}"
AWS_ACCOUNT_ID="383762989543"
ECR_REPOSITORY="airis-ui"
MAX_ARCHIVE_BYTES=$((250 * 1024 * 1024))
MAX_ARCHIVE_FILES=5000

temporary_dir=""
smoke_container_id=""
import_branch=""

usage() {
  echo "Usage: $0 /path/to/chatgpt-site-download.zip" >&2
}

fail() {
  echo "ERROR: $*" >&2
  if [[ -n "$import_branch" ]]; then
    echo "The imported changes remain on branch: $import_branch" >&2
  fi
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Required command not found: $1"
}

confirm() {
  local answer
  read -r -p "$1 [y/N] " answer
  case "$answer" in
    y|Y|yes|YES) return 0 ;;
    *) return 1 ;;
  esac
}

archive_hash() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print substr($1, 1, 12)}'
  else
    sha256sum "$1" | awk '{print substr($1, 1, 12)}'
  fi
}

cleanup() {
  if [[ -n "$smoke_container_id" ]]; then
    docker rm -f "$smoke_container_id" >/dev/null 2>&1 || true
  fi

  if [[ -n "$temporary_dir" ]]; then
    case "$temporary_dir" in
      "${TMPDIR:-/tmp}"/airis-sites-import.*)
        rm -rf "$temporary_dir"
        ;;
    esac
  fi
}

trap cleanup EXIT

if [[ $# -ne 1 ]]; then
  usage
  exit 2
fi

require_command aws
require_command curl
require_command docker
require_command git
require_command perl
require_command rsync
require_command seq
require_command terraform
require_command unzip

if command -v shasum >/dev/null 2>&1; then
  :
else
  require_command sha256sum
fi

zip_input="$1"
[[ -f "$zip_input" ]] || fail "ZIP file does not exist: $zip_input"
zip_directory="$(cd "$(dirname "$zip_input")" && pwd -P)"
zip_path="$zip_directory/$(basename "$zip_input")"

[[ -d "$PROJECT_ROOT/.git" ]] || fail "Not a Git repository: $PROJECT_ROOT"
[[ -d "$TERRAFORM_ROOT" ]] || fail "Terraform directory not found: $TERRAFORM_ROOT"

cd "$PROJECT_ROOT"

current_branch="$(git branch --show-current)"
[[ "$current_branch" == "main" ]] || fail "Start from the main branch, not: $current_branch"

if [[ -n "$(git status --porcelain)" ]]; then
  git status --short >&2
  fail "The UI repository must be clean. Resolve the files above first. For a generated next-env.d.ts-only change, use: git restore next-env.d.ts"
fi

[[ -n "${NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:-}" ]] || fail "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is not set in this terminal"

actual_account_id="$(aws sts get-caller-identity --query Account --output text)"
[[ "$actual_account_id" == "$AWS_ACCOUNT_ID" ]] || fail "AWS account is $actual_account_id; expected $AWS_ACCOUNT_ID"

aws ecr describe-repositories \
  --region "$AWS_REGION" \
  --repository-names "$ECR_REPOSITORY" \
  >/dev/null

unzip -tq "$zip_path" >/dev/null || fail "ZIP integrity check failed"

archive_file_count="$(unzip -Z1 "$zip_path" | awk 'END {print NR}')"
[[ "$archive_file_count" -le "$MAX_ARCHIVE_FILES" ]] || fail "ZIP contains too many entries: $archive_file_count"

archive_uncompressed_bytes="$(unzip -l "$zip_path" | awk 'END {print $1}')"
[[ "$archive_uncompressed_bytes" =~ ^[0-9]+$ ]] || fail "Could not determine ZIP uncompressed size"
[[ "$archive_uncompressed_bytes" -le "$MAX_ARCHIVE_BYTES" ]] || fail "ZIP expands beyond the 250 MiB safety limit"

while IFS= read -r archive_entry; do
  if [[ "$archive_entry" == /* || "$archive_entry" == *\\* || "/$archive_entry/" == *"/../"* ]]; then
    fail "Unsafe path in ZIP: $archive_entry"
  fi
done < <(unzip -Z1 "$zip_path")

temporary_dir="$(mktemp -d "${TMPDIR:-/tmp}/airis-sites-import.XXXXXX")"
extract_root="$temporary_dir/extracted"
mkdir -p "$extract_root"
unzip -q "$zip_path" -d "$extract_root"

if [[ -n "$(find "$extract_root" -type l -print -quit)" ]]; then
  fail "ZIP contains symbolic links; refusing to import it"
fi

sites_root=""
while IFS= read -r package_file; do
  candidate_root="$(dirname "$package_file")"
  if [[ -f "$candidate_root/app/page.tsx" && -f "$candidate_root/app/layout.tsx" ]]; then
    if [[ -n "$sites_root" ]]; then
      fail "ZIP contains more than one possible Site project"
    fi
    sites_root="$candidate_root"
  fi
done < <(find "$extract_root" -type f -name package.json -print)

[[ -n "$sites_root" ]] || fail "Could not find app/page.tsx, app/layout.tsx, and package.json in the ZIP"
[[ -d "$sites_root/public" ]] || fail "The downloaded Site has no public directory"

archive_id="$(archive_hash "$zip_path")"
import_branch="codex/sites-import-$(date -u +%Y%m%d-%H%M%S)"
git switch -c "$import_branch"

# Promote product source, while preserving production-owned API configuration
# and excluding any Sites server-side proxy routes.
rsync -a --delete \
  --exclude '.DS_Store' \
  --exclude 'api/' \
  --exclude 'api-config.ts' \
  "$sites_root/app/" "$PROJECT_ROOT/app/"

rsync -a --delete \
  --exclude '.DS_Store' \
  "$sites_root/public/" "$PROJECT_ROOT/public/"

[[ -f "$PROJECT_ROOT/app/api-config.ts" ]] || fail "Production app/api-config.ts was lost"
[[ -f "$PROJECT_ROOT/public/manifest.webmanifest" ]] || fail "Imported Site is missing public/manifest.webmanifest"

if grep -R -n --exclude='*.map' '/api/trominos' "$PROJECT_ROOT/app" >/dev/null 2>&1; then
  grep -R -n --exclude='*.map' '/api/trominos' "$PROJECT_ROOT/app" >&2 || true
  fail "Imported source contains the Sites-only /api/trominos proxy path. Adapt it to app/api-config.ts before building"
fi

if [[ -f "$PROJECT_ROOT/public/sw.js" ]]; then
  perl -0pi -e "s/const CACHE_NAME = '[^']+';/const CACHE_NAME = 'airis-shell-${archive_id}';/" "$PROJECT_ROOT/public/sw.js"
fi

if [[ -z "$(git status --porcelain)" ]]; then
  echo "The ZIP contains no product-source changes to promote."
  exit 0
fi

echo
echo "Imported change summary:"
git status --short
git diff --stat
echo

if ! confirm "Commit these imported UI changes and run the production container checks?"; then
  echo "Stopped before commit, build, or push. Review branch: $import_branch"
  exit 0
fi

git add app public
git commit -m "feat: promote ChatGPT Sites UI ${archive_id}"

image_tag="$(git rev-parse --short=12 HEAD)"
local_image="airis-ui:verify-${image_tag}"
ecr_url="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPOSITORY}"
remote_image="${ecr_url}:${image_tag}"

docker buildx build \
  --platform linux/amd64 \
  --build-arg NEXT_PUBLIC_TROMINOS_API_URL=https://api.trominos.com \
  --build-arg NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY" \
  --load \
  --tag "$local_image" \
  "$PROJECT_ROOT"

smoke_container_id="$(docker run --rm -d -p 127.0.0.1::8080 "$local_image")"
smoke_port="$(docker port "$smoke_container_id" 8080/tcp | awk -F: 'END {print $NF}')"
[[ -n "$smoke_port" ]] || fail "Could not determine the local smoke-test port"

smoke_ready=0
for _ in $(seq 1 45); do
  if curl -fsS "http://127.0.0.1:${smoke_port}/healthz" >/dev/null 2>&1; then
    smoke_ready=1
    break
  fi
  sleep 1
done

[[ "$smoke_ready" -eq 1 ]] || fail "Container did not become healthy within 45 seconds"

[[ "$(curl -fsS "http://127.0.0.1:${smoke_port}/healthz")" == "ok" ]] || fail "Unexpected /healthz response"
curl -fsS "http://127.0.0.1:${smoke_port}/" >/dev/null || fail "UI root smoke test failed"
curl -fsS "http://127.0.0.1:${smoke_port}/manifest.webmanifest" >/dev/null || fail "Manifest smoke test failed"

missing_status="$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:${smoke_port}/missing-airis-asset.js")"
[[ "$missing_status" == "404" ]] || fail "Missing static asset returned HTTP $missing_status instead of 404"

docker rm -f "$smoke_container_id" >/dev/null
smoke_container_id=""

echo
echo "Production container checks passed for commit $image_tag."
echo

if ! confirm "Fast-forward main to this validated commit and push $remote_image to ECR?"; then
  echo "Validated locally but not pushed. Review branch: $import_branch"
  exit 0
fi

git switch main
git merge --ff-only "$import_branch"

aws ecr get-login-password --region "$AWS_REGION" | \
  docker login --username AWS --password-stdin "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

docker tag "$local_image" "$remote_image"
docker push "$remote_image"

image_digest="$(aws ecr describe-images \
  --region "$AWS_REGION" \
  --repository-name "$ECR_REPOSITORY" \
  --image-ids "imageTag=$image_tag" \
  --query 'imageDetails[0].imageDigest' \
  --output text)"

echo
echo "UI image pushed successfully."
echo "Git commit : $image_tag"
echo "ECR image  : $remote_image"
echo "Digest     : $image_digest"
echo
echo "No ECS or DNS change was made. Review the next Terraform plan with:"
echo "terraform -chdir=$TERRAFORM_ROOT plan -var=\"ui_image_tag=$image_tag\" -var=\"ui_desired_count=1\" -var=\"ui_manage_dns=true\" -out=\"/tmp/airis-ui-${image_tag}.tfplan\""
