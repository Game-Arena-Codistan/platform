#!/usr/bin/env bash
# 1) Sync the live web container html into the known static root on this host.
# 2) Repair the gsmarena-play.com vhost so / is proxied to gateway :8095 without
#    duplicate location blocks.
# 3) Probe loopback and the public DNS A record from this host.
set -euo pipefail

EXPECTED_SHA="${1:?expected release SHA required}"
COMPOSE_FILE="${COMPOSE_FILE:-infra/docker-compose.staging.yml}"
ENV_FILE="${ENV_FILE:-infra/.env}"
ROOT_DIR="${ROOT_DIR:-$(pwd)}"
STATIC_ROOT="${STATIC_ROOT:-/var/www/gsmarena-play.com/html}"
SITE_ENABLED="${SITE_ENABLED:-/etc/nginx/sites-enabled/gsmarena-play.com}"
SITE_AVAILABLE="${SITE_AVAILABLE:-/etc/nginx/sites-available/gsmarena-play.com}"

cd "$ROOT_DIR"

sudo_run() {
  if command -v sudo >/dev/null 2>&1; then
    sudo -n "$@"
  else
    "$@"
  fi
}

gateway_config="$(curl --fail --silent --max-time 8 http://127.0.0.1:8095/config.js)"
printf '%s\n' "$gateway_config" | grep -Fq "releaseSha:\"$EXPECTED_SHA\"" || {
  echo "Gateway :8095/config.js does not contain releaseSha=$EXPECTED_SHA" >&2
  printf '%s\n' "$gateway_config" >&2
  exit 1
}

echo "=== host identity ==="
hostname -f 2>/dev/null || hostname || true
hostname -I 2>/dev/null || true
public_ip="$(getent ahostsv4 gsmarena-play.codistan.org 2>/dev/null | awk 'NR==1{print $1}' || true)"
echo "dns_a_record=${public_ip:-unknown}"

compose=(docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE")
web_cid="$("${compose[@]}" ps -q web || true)"
[ -n "$web_cid" ] || { echo 'ERROR: web container id unavailable' >&2; exit 1; }

echo "=== sync web container html → ${STATIC_ROOT} ==="
tmp="$(mktemp -d)"
docker cp "$web_cid:/usr/share/nginx/html/." "$tmp/"
sudo_run mkdir -p "$STATIC_ROOT"
sudo_run cp -a "$tmp"/. "$STATIC_ROOT"/
# Keep a tarball for optional copy to the public edge host.
sudo_run mkdir -p /opt/codistan/platform/.staging-web-html
sudo_run rm -rf /opt/codistan/platform/.staging-web-html/*
sudo_run cp -a "$tmp"/. /opt/codistan/platform/.staging-web-html/
rm -rf "$tmp"
echo "static_config_after_sync=$(sudo_run head -c 500 "$STATIC_ROOT/config.js" || true)"
sudo_run grep -Fq "releaseSha:\"$EXPECTED_SHA\"" "$STATIC_ROOT/config.js"

echo "=== restore clean gsmarena site + write proxy vhost ==="
sudo_run mkdir -p /etc/nginx/snippets
sudo_run cp -f infra/host-nginx/game-arena-admin.conf /etc/nginx/snippets/game-arena-admin.conf
sudo_run cp -f infra/host-nginx/game-arena-player.conf /etc/nginx/snippets/game-arena-player.conf

# Prefer the oldest known-good backup before our duplicate-location experiments.
restore_candidate=""
for candidate in \
  "${SITE_ENABLED}.bak.adminfix" \
  "${SITE_AVAILABLE}.bak.adminfix" \
  "${SITE_ENABLED}.bak.playeredge" \
  "${SITE_AVAILABLE}.bak.playeredge" \
  "$SITE_AVAILABLE" \
  "$SITE_ENABLED"
do
  if sudo_run test -f "$candidate"; then
    if sudo_run grep -q 'server_name' "$candidate" \
      && ! sudo_run grep -q 'duplicate' "$candidate"; then
      restore_candidate="$candidate"
      break
    fi
  fi
done

if [ -n "$restore_candidate" ]; then
  echo "using base site file $restore_candidate"
  tmp_site="$(mktemp)"
  sudo_run cat "$restore_candidate" > "$tmp_site"
else
  echo 'ERROR: no recoverable gsmarena-play.com site file' >&2
  exit 1
fi

python3 - "$tmp_site" <<'PY'
import pathlib
import re
import sys

path = pathlib.Path(sys.argv[1])
text = path.read_text(encoding='utf-8', errors='replace')

# Drop previous recovery includes/comments so we can rewrite cleanly.
text = re.sub(r'^\s*include\s+snippets/game-arena-(?:admin|player)\.conf;\s*$', '', text, flags=re.M)
text = re.sub(r'^# disabled stale static player location.*\n(?:# .*\n)*', '', text, flags=re.M)

# Comment every existing location / block (nested one level).
def comment_location(match):
    block = match.group(0)
    if 'snippets/game-arena-player.conf' in block:
        return ''
    commented = '\n'.join((line if not line.strip() else f'# {line}') for line in block.splitlines())
    return '# removed in favour of snippets/game-arena-player.conf\n' + commented

text = re.sub(r'location\s+/\s*\{(?:[^{}]|\{[^{}]*\})*\}', comment_location, text, flags=re.M)

# Point old admin upstreams at the gateway.
text = re.sub(
    r'proxy_pass\s+http://(?:localhost|127\.0\.0\.1):(8083|18183)/?\s*;',
    'proxy_pass http://127.0.0.1:8095;',
    text,
)

# Ensure staging hostname is accepted.
if 'gsmarena-play.codistan.org' not in text and re.search(r'server_name\s+[^;]*gsmarena-play\.com', text):
    text = re.sub(
        r'(server_name\s+)([^;]*gsmarena-play\.com[^;]*);',
        r'\1\2 gsmarena-play.codistan.org;',
        text,
        count=1,
    )

def inject_includes(match):
    return (
        match.group(0)
        + '\n    include snippets/game-arena-admin.conf;'
        + '\n    include snippets/game-arena-player.conf;'
    )

if 'snippets/game-arena-player.conf' not in text:
    text = re.sub(
        r'server_name\s+[^\n]*gsmarena-play\.(?:codistan\.org|com)[^\n]*;',
        inject_includes,
        text,
        count=1,
    )

# Collapse excessive blank lines.
text = re.sub(r'\n{3,}', '\n\n', text)
path.write_text(text, encoding='utf-8')
print(f'wrote cleaned site to {path}')
PY

sudo_run cp -a "$tmp_site" "$SITE_AVAILABLE"
sudo_run cp -a "$tmp_site" "$SITE_ENABLED"
rm -f "$tmp_site"

# Restore unrelated vhosts corrupted by earlier broad greps.
for broken in \
  /etc/nginx/sites-enabled/skillupshop.com \
  /etc/nginx/sites-enabled/watch-jalwa.com \
  /etc/nginx/conf.d/connection_upgrade.conf
do
  if sudo_run test -f "${broken}.bak.playeredge"; then
    echo "restoring $broken from bak.playeredge"
    sudo_run cp -a "${broken}.bak.playeredge" "$broken"
  fi
done

# Remove backup copies from sites-enabled so nginx does not load them as duplicate servers.
sudo_run bash -lc 'rm -f /etc/nginx/sites-enabled/*.bak.* /etc/nginx/sites-enabled/*.bak 2>/dev/null || true'

echo "=== nginx -t / reload ==="
sudo_run nginx -t
sudo_run systemctl reload nginx 2>/dev/null || sudo_run systemctl restart nginx
sudo_run systemctl is-active nginx

echo "=== probes ==="
sni_loopback="$(curl --fail --silent --max-time 8 -k --resolve gsmarena-play.codistan.org:443:127.0.0.1 https://gsmarena-play.codistan.org/config.js)"
printf 'sni_loopback=%s\n' "$sni_loopback"
printf '%s\n' "$sni_loopback" | grep -Fq "releaseSha:\"$EXPECTED_SHA\""

if [ -n "${public_ip:-}" ]; then
  sni_public_ip="$(curl --fail --silent --max-time 8 -k --resolve "gsmarena-play.codistan.org:443:${public_ip}" https://gsmarena-play.codistan.org/config.js || true)"
  printf 'sni_public_ip=%s\n' "$sni_public_ip"
  if ! printf '%s\n' "$sni_public_ip" | grep -Fq "releaseSha:\"$EXPECTED_SHA\""; then
    echo "WARNING: public DNS A ${public_ip} still stale from this host; a separate public edge may own that IP." >&2
    echo "STATIC_ROOT on this host is updated; public edge sync is required next." >&2
    # Non-fatal here: deploy workflow also verifies from the internet and can fail there.
  fi
fi

echo "Local player edge rewire complete for releaseSha=$EXPECTED_SHA"
