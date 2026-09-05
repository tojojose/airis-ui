#!/usr/bin/env bash
# Local build/run for airis-ui, without the 30-minute emulated deploy loop.
#
#   ./dev-local.sh marketing   live-reload dev server for the marketing site  :3001
#   ./dev-local.sh app         live-reload dev server for the product app     :3000
#   ./dev-local.sh image       build the REAL container natively, run it, assert routing
#
# "image" is the one that reproduces production. The deploy script builds
# --platform linux/amd64, which on Apple silicon runs the whole Next build
# under QEMU and takes ~30 minutes. Locally we build for the native arch: same
# Dockerfile, same nginx.conf, same base image, minutes instead of half an hour.
# It cannot be pushed to ECR (wrong architecture) and is not meant to be - it is
# for answering "does the routing work" before spending a real deploy on it.

set -Eeuo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

MODE="${1:-image}"
PORT="${PORT:-8080}"
NAME=airis-ui-local

case "$MODE" in
  marketing)
    cd marketing
    [[ -d node_modules ]] || npm ci
    # package.json's "dev" is `vinext dev` (the Cloudflare/vite runner), but the
    # Docker stage builds with plain `next build`. Prefer `next dev` so what you
    # see locally matches what ships; fall back to the package script if it
    # refuses. (Not `exec ... || exec ...` - a failed exec replaces the shell and
    # never reaches the fallback.)
    npx next dev --port "${PORT_MARKETING:-3001}" || npm run dev
    exit $?
    ;;

  app)
    [[ -d node_modules ]] || npm ci
    exec npx next dev --port "${PORT_APP:-3000}"
    ;;

  image) ;;
  *) echo "usage: $0 [marketing|app|image]" >&2; exit 2 ;;
esac

command -v docker >/dev/null || { echo "ERROR: docker not found" >&2; exit 1; }
[[ -n "${NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:-}" ]] ||
  { echo "ERROR: export NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY first (the Dockerfile refuses to build without it)" >&2; exit 1; }

echo "==> Building natively (no --platform, so no QEMU)"
docker build \
  --build-arg NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY" \
  --build-arg NEXT_PUBLIC_TROMINOS_API_URL="${API_HOST_URL:-https://api.visinexa.com}" \
  --tag "$NAME" .

docker rm -f "$NAME" >/dev/null 2>&1 || true

# Validate the config BEFORE starting. If nginx cannot parse it the container
# exits instantly, and `docker run --rm` then deletes the only copy of the
# error - which is how a config fault masquerades as "no such container".
echo "==> nginx -t inside the image"
if ! docker run --rm --entrypoint nginx "$NAME" -t; then
  echo
  echo "nginx rejects the config in THIS image. In ECS that is a task that never"
  echo "becomes healthy, so deployment_circuit_breaker rolls back and the service"
  echo "keeps serving the previous image while still reporting itself stable."
  exit 1
fi

# No --rm: keep the container so its logs survive a crash.
docker run -d --name "$NAME" -p "127.0.0.1:$PORT:8080" "$NAME" >/dev/null
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true' EXIT

for _ in $(seq 1 40); do
  curl -fsS -o /dev/null "http://127.0.0.1:$PORT/healthz" 2>/dev/null && break
  sleep 0.25
done

if [[ "$(docker inspect -f '{{.State.Running}}' "$NAME" 2>/dev/null)" != "true" ]]; then
  echo "==> container is not running; its logs:"
  docker logs "$NAME" 2>&1 | sed 's/^/    /'
  echo "==> exit code: $(docker inspect -f '{{.State.ExitCode}}' "$NAME" 2>/dev/null)"
  exit 1
fi

echo
echo "==> nginx.conf actually inside the image:"
docker exec "$NAME" sed -n '/^map/,/^}/p' /etc/nginx/conf.d/default.conf | sed 's/^/    /'

echo
echo "==> Routing (x-airis-public-host is what API Gateway injects in production)"
MARKETING="Human-led visual compliance intelligence"
APP="Visinexa Vision Governance"
pass=0; fail=0
check() { # public-host | expected title fragment | label
  local got
  got="$(curl -s -H "x-airis-public-host:$1" "http://127.0.0.1:$PORT/" || true)"
  if printf '%s' "$got" | grep -qF "$2"; then
    printf '  ok    %-24s -> %s\n' "$1" "$3"; pass=$((pass+1))
  else
    printf '  FAIL  %-24s -> %s\n' "$1" \
      "$(printf '%s' "$got" | grep -o '<title>[^<]*</title>' | head -1)"; fail=$((fail+1))
  fi
}
check www.visinexa.com    "$MARKETING" "marketing site"
check visinexa.com        "$MARKETING" "marketing site"
check portal.trominos.com "$MARKETING" "marketing site"
check app.visinexa.com    "$APP"       "application"
check app.trominos.com    "$APP"       "application"

echo
echo "==> Marketing CTA target (must be app.visinexa.com, not www)"
curl -s -H 'x-airis-public-host:www.visinexa.com' "http://127.0.0.1:$PORT/" |
  grep -o 'href="https://[a-z.]*visinexa\.com"' | sort -u | sed 's/^/    /'

echo
cat <<EOF
Browse it - routing is BY HOSTNAME, so the URL you use decides the build:

  application    http://127.0.0.1:$PORT/
  marketing      http://portal.localhost:$PORT/
                 http://marketing.localhost:$PORT/

127.0.0.1 is not a marketing hostname, so it correctly serves the app. Chrome
and Firefox send *.localhost to loopback on their own; for Safari add
"127.0.0.1 portal.localhost marketing.localhost" to /etc/hosts.

The checks above are the real verdict - a browser cannot send the
x-airis-public-host header that API Gateway injects in production.
EOF
if (( fail )); then echo; echo "$fail routing FAILURES - do not deploy this."; fi
read -r -p $'\nPress Enter to stop the container... '
