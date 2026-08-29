#!/usr/bin/env bash

set -Eeuo pipefail

PROJECT_ROOT="/Users/tojojose/trominos/airis-ui"
TERRAFORM_ROOT="/Users/tojojose/trominos/airis/terraform"
AWS_REGION="${AWS_REGION:-us-east-1}"
AWS_ACCOUNT_ID="383762989543"
ECR_REPOSITORY="airis-ui"

temporary_dir=""
smoke_container_id=""
import_branch=""

usage() {
  echo "Usage: $0 /path/to/chatgpt-marketing-site.zip" >&2
}

fail() {
  echo "ERROR: $*" >&2
  if [[ -n "$import_branch" ]]; then
    echo "Imported changes remain on branch: $import_branch" >&2
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

cleanup() {
  if [[ -n "$smoke_container_id" ]]; then
    docker rm -f "$smoke_container_id" >/dev/null 2>&1 || true
  fi
  if [[ -n "$temporary_dir" && "$temporary_dir" == "${TMPDIR:-/tmp}"/airis-portal-import.* ]]; then
    rm -rf "$temporary_dir"
  fi
}

trap cleanup EXIT

[[ $# -eq 1 ]] || { usage; exit 2; }

for command_name in aws curl docker git rsync terraform unzip; do
  require_command "$command_name"
done

zip_input="$1"
[[ -f "$zip_input" ]] || fail "ZIP file does not exist: $zip_input"
zip_directory="$(cd "$(dirname "$zip_input")" && pwd -P)"
zip_path="$zip_directory/$(basename "$zip_input")"

[[ -d "$PROJECT_ROOT/.git" ]] || fail "Not a Git repository: $PROJECT_ROOT"
[[ -d "$TERRAFORM_ROOT" ]] || fail "Terraform directory not found: $TERRAFORM_ROOT"
[[ -n "${NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:-}" ]] || fail "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is not set"

cd "$PROJECT_ROOT"

current_branch="$(git branch --show-current)"
[[ "$current_branch" == "main" ]] || fail "Start from the main branch, not: $current_branch"
[[ -z "$(git status --porcelain)" ]] || fail "The UI repository must be clean before promotion"

actual_account_id="$(aws sts get-caller-identity --query Account --output text)"
[[ "$actual_account_id" == "$AWS_ACCOUNT_ID" ]] || fail "AWS account is $actual_account_id; expected $AWS_ACCOUNT_ID"

unzip -tq "$zip_path" >/dev/null || fail "ZIP integrity check failed"
while IFS= read -r archive_entry; do
  if [[ "$archive_entry" == /* || "$archive_entry" == *\\* || "/$archive_entry/" == *"/../"* ]]; then
    fail "Unsafe path in ZIP: $archive_entry"
  fi
done < <(unzip -Z1 "$zip_path")

temporary_dir="$(mktemp -d "${TMPDIR:-/tmp}/airis-portal-import.XXXXXX")"
extract_root="$temporary_dir/extracted"
mkdir -p "$extract_root"
unzip -q "$zip_path" -d "$extract_root"

[[ -z "$(find "$extract_root" -type l -print -quit)" ]] || fail "ZIP contains symbolic links"

sites_root=""
while IFS= read -r package_file; do
  candidate_root="$(dirname "$package_file")"
  if [[ -f "$candidate_root/app/page.tsx" && -f "$candidate_root/app/layout.tsx" ]]; then
    [[ -z "$sites_root" ]] || fail "ZIP contains more than one possible Site project"
    sites_root="$candidate_root"
  fi
done < <(find "$extract_root" -type f -name package.json -print)

[[ -n "$sites_root" ]] || fail "Could not find the marketing Site project in the ZIP"
[[ -d "$sites_root/public" ]] || fail "The marketing Site has no public directory"
[[ -f "$PROJECT_ROOT/marketing/package.json" ]] || fail "Production marketing build configuration is missing"

import_branch="codex/portal-import-$(date -u +%Y%m%d-%H%M%S)"
git switch -c "$import_branch"

# Import only marketing content. Production-owned Next.js and Docker settings
# remain unchanged so a ChatGPT Sites export cannot overwrite the product UI.
rsync -a --delete --exclude '.DS_Store' "$sites_root/app/" "$PROJECT_ROOT/marketing/app/"
rsync -a --delete --exclude '.DS_Store' "$sites_root/public/" "$PROJECT_ROOT/marketing/public/"

if [[ -z "$(git status --porcelain -- marketing/app marketing/public)" ]]; then
  echo "The ZIP contains no marketing changes to promote."
  exit 0
fi

echo
echo "Marketing change summary:"
git status --short -- marketing/app marketing/public
git diff --stat -- marketing/app marketing/public
echo

confirm "Commit these marketing changes and run the combined container checks?" || exit 0

git add marketing/app marketing/public
git commit -m "feat: promote approved marketing homepage"

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

smoke_container_id="$(docker run --rm -d --platform linux/amd64 -p 127.0.0.1::8080 "$local_image")"
smoke_port="$(docker port "$smoke_container_id" 8080/tcp | awk -F: 'END {print $NF}')"
[[ -n "$smoke_port" ]] || fail "Could not determine the local smoke-test port"

for _ in $(seq 1 45); do
  curl -fsS "http://127.0.0.1:${smoke_port}/healthz" >/dev/null 2>&1 && break
  sleep 1
done

[[ "$(curl -fsS "http://127.0.0.1:${smoke_port}/healthz")" == "ok" ]] || fail "Container health check failed"
curl -fsS -H 'Host: app.trominos.com' "http://127.0.0.1:${smoke_port}/" >/dev/null || fail "Product UI check failed"
portal_html="$(curl -fsS -H 'Host: portal.trominos.com' "http://127.0.0.1:${smoke_port}/")"
grep -q "See potential risks" <<<"$portal_html" || fail "Marketing homepage content check failed"

docker rm -f "$smoke_container_id" >/dev/null
smoke_container_id=""

echo
echo "Combined product and marketing container checks passed."
confirm "Fast-forward main and push $remote_image to ECR?" || exit 0

git switch main
git merge --ff-only "$import_branch"

aws ecr get-login-password --region "$AWS_REGION" | \
  docker login --username AWS --password-stdin "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

docker tag "$local_image" "$remote_image"
docker push "$remote_image"

echo
echo "Image pushed: $remote_image"
echo "Review the Terraform deployment plan with:"
echo "terraform -chdir=$TERRAFORM_ROOT plan -var=\"ui_image_tag=$image_tag\" -var=\"ui_desired_count=1\" -var=\"ui_manage_dns=true\" -var=\"ui_manage_portal_dns=true\" -out=\"/tmp/airis-portal-${image_tag}.tfplan\""
