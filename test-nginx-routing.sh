#!/usr/bin/env bash
# Verifies airis-ui/nginx.conf routes each public hostname to the right build.
#
# One image contains both the marketing site and the product app; nginx picks
# between them from the hostname. That decision has no other test, and getting
# it wrong is quiet - the marketing page served on app.visinexa.com looks like
# a broken deploy, not a config typo. This exercises the REAL nginx.conf with a
# real nginx against fixture document roots, so it needs no Docker build.
#
# Requires: nginx, curl.  Usage: ./test-nginx-routing.sh

set -Eeuo pipefail

command -v nginx >/dev/null || { echo "SKIP: nginx not installed"; exit 0; }

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
conf="$here/nginx.conf"
[[ -f "$conf" ]] || { echo "ERROR: $conf not found" >&2; exit 1; }

R="$(mktemp -d)"
trap 'kill %1 2>/dev/null || true; rm -rf "$R"' EXIT

mkdir -p "$R"/{conf,logs,html/marketing,tmp/{client,proxy,fastcgi,uwsgi,scgi}}
# nginx workers drop to an unprivileged user, so they must be able to traverse
# and read the fixture tree. mktemp -d gives 0700, which yields a wall of 403s
# that look like a routing failure but are only permissions.
chmod -R a+rX "$R"
echo PRODUCT-APP    > "$R/html/index.html"
echo MARKETING-SITE > "$R/html/marketing/index.html"
echo 404-product    > "$R/html/404.html"
echo 404-marketing  > "$R/html/marketing/404.html"

# Wrap the real config verbatim; only the document root is repointed at the
# fixtures, and IPv6 is dropped because many CI containers have none.
{
  echo "daemon off; error_log $R/logs/error.log warn; pid $R/nginx.pid;"
  echo "events { worker_connections 64; }"
  echo "http {"
  echo "  include /etc/nginx/mime.types; access_log off;"
  echo "  client_body_temp_path $R/tmp/client; proxy_temp_path $R/tmp/proxy;"
  echo "  fastcgi_temp_path $R/tmp/fastcgi; uwsgi_temp_path $R/tmp/uwsgi; scgi_temp_path $R/tmp/scgi;"
  sed -e "s#/usr/share/nginx/html#$R/html#" -e '/listen \[::\]:8080;/d' "$conf"
  echo "}"
} > "$R/conf/nginx.conf"

chmod -R a+rX "$R"
nginx -t -c "$R/conf/nginx.conf" -p "$R"
nginx    -c "$R/conf/nginx.conf" -p "$R" &
for _ in $(seq 1 40); do
  curl -fsS -o /dev/null "http://127.0.0.1:8080/healthz" 2>/dev/null && break
  sleep 0.25
done

# The Host a VPC Link request actually arrives with - never the public name.
INTERNAL="airis-ui.airis.local"
pass=0; fail=0

check() { # public-host ("-" = header absent) | Host | expected | label
  local hdr=() got
  [[ "$1" != "-" ]] && hdr=(-H "x-airis-public-host:$1")
  got="$(curl -s "${hdr[@]}" -H "Host: $2" http://127.0.0.1:8080/ | tr -d '\n')"
  if [[ "$got" == "$3" ]]; then
    printf '  ok    %-38s -> %s\n' "$4" "$got"; pass=$((pass+1))
  else
    printf '  FAIL  %-38s -> %s (want %s)\n' "$4" "$got" "$3"; fail=$((fail+1))
  fi
}

echo "--- production: API Gateway supplies x-airis-public-host ---"
check www.visinexa.com    "$INTERNAL" MARKETING-SITE "www.visinexa.com"
check visinexa.com        "$INTERNAL" MARKETING-SITE "visinexa.com (apex)"
check portal.trominos.com "$INTERNAL" MARKETING-SITE "portal.trominos.com (legacy)"
check app.visinexa.com    "$INTERNAL" PRODUCT-APP    "app.visinexa.com"
check app.trominos.com    "$INTERNAL" PRODUCT-APP    "app.trominos.com (legacy)"
check WWW.VISINEXA.COM    "$INTERNAL" MARKETING-SITE "uppercase host"

echo "--- smoke tests / local: no header, Host only ---"
check - portal.trominos.com MARKETING-SITE "Host: portal.trominos.com"
check - www.visinexa.com    MARKETING-SITE "Host: www.visinexa.com"
check - app.visinexa.com    PRODUCT-APP    "Host: app.visinexa.com"
check - portal.localhost    MARKETING-SITE "portal.localhost"
check - localhost           PRODUCT-APP    "localhost"

# A substring match must never be enough. An unanchored regex map made all
# three of these serve the marketing site.
echo "--- lookalike hostnames must get the product, not marketing ---"
check app.www.visinexa.com.evil.test "$INTERNAL" PRODUCT-APP "suffixed lookalike"
check notvisinexa.com               "$INTERNAL" PRODUCT-APP "prefixed lookalike"
check visinexa.com.attacker.test    "$INTERNAL" PRODUCT-APP "apex as a subdomain"

code="$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/healthz)"
[[ "$code" == 200 ]] && { echo "  ok    healthz -> 200"; pass=$((pass+1)); } \
                     || { echo "  FAIL  healthz -> $code"; fail=$((fail+1)); }

echo
if (( fail )); then echo "FAILED: $fail of $((pass+fail))"; exit 1; fi
echo "ALL $pass ROUTING TESTS PASSED"
