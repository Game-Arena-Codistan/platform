#!/usr/bin/env bash
# Sync live web container html into the staging static root and attempt to heal
# the local gsmarena-play.com nginx site. Static sync success is the primary
# outcome; nginx heal failures are reported but do not block the public-edge
# copy step that follows in CI.
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
sudo_run mkdir -p /opt/codistan/platform/.staging-web-html
sudo_run rm -rf /opt/codistan/platform/.staging-web-html/*
sudo_run cp -a "$tmp"/. /opt/codistan/platform/.staging-web-html/
rm -rf "$tmp"
echo "static_config_after_sync=$(sudo_run head -c 500 "$STATIC_ROOT/config.js" || true)"
sudo_run grep -Fq "releaseSha:\"$EXPECTED_SHA\"" "$STATIC_ROOT/config.js"
sudo_run grep -Fq 'tiktokPixelId' "$STATIC_ROOT/config.js"
sudo_run grep -Fq 'game-arena-tiktok-pixel-id' "$STATIC_ROOT/index.html"
echo "STATIC_SYNC_OK=1"

echo "=== heal local nginx site ==="
base=""
for candidate in \
  "${SITE_AVAILABLE}.bak.adminfix" \
  "${SITE_ENABLED}.bak.adminfix" \
  "$SITE_AVAILABLE" \
  "$SITE_ENABLED"
do
  if sudo_run test -f "$candidate"; then
    base="$candidate"
    break
  fi
done
[ -n "$base" ] || { echo 'WARNING: no gsmarena site base file; skipping nginx heal' >&2; exit 0; }

tmp_site="$(mktemp)"
sudo_run cat "$base" > "$tmp_site"
python3 - "$tmp_site" <<'PY'
import pathlib
import re
import sys

path = pathlib.Path(sys.argv[1])
text = path.read_text(encoding='utf-8', errors='replace')

# Drop every recovery include.
text = re.sub(r'^\s*include\s+snippets/game-arena-(?:admin|player)\.conf;\s*\n?', '', text, flags=re.M)

# Drop previously commented duplicate blocks.
text = re.sub(r'^# removed in favour of snippets/game-arena-player\.conf\n(?:# .*\n)+', '', text, flags=re.M)
text = re.sub(r'^# disabled stale static player location.*\n(?:# .*\n)+', '', text, flags=re.M)

# Keep only the first location / block; comment any later ones.
seen = {'n': 0}
def keep_first_root(match):
    seen['n'] += 1
    block = match.group(0)
    if seen['n'] == 1:
        return block
    commented = '\n'.join((line if not line.strip() else f'# {line}') for line in block.splitlines())
    return '# duplicate location / removed\n' + commented

text = re.sub(r'location\s+/\s*\{(?:[^{}]|\{[^{}]*\})*\}', keep_first_root, text, flags=re.M)

text = re.sub(
    r'proxy_pass\s+http://(?:localhost|127\.0\.0\.1):(8083|18183)/?\s*;',
    'proxy_pass http://127.0.0.1:8095;',
    text,
)

if 'gsmarena-play.codistan.org' not in text and re.search(r'server_name\s+[^;]*gsmarena-play\.com', text):
    text = re.sub(
        r'(server_name\s+)([^;]*gsmarena-play\.com[^;]*);',
        r'\1\2 gsmarena-play.codistan.org;',
        text,
        count=1,
    )

if 'snippets/game-arena-admin.conf' not in text:
    text = re.sub(
        r'(server_name\s+[^\n]*gsmarena-play\.(?:codistan\.org|com)[^\n]*;)',
        r'\1\n    include snippets/game-arena-admin.conf;',
        text,
        count=1,
    )

text = re.sub(r'\n{3,}', '\n\n', text)
path.write_text(text, encoding='utf-8')
print('--- healed site head ---')
print('\n'.join(path.read_text(encoding='utf-8').splitlines()[:40]))
PY

sudo_run mkdir -p /etc/nginx/snippets
sudo_run cp -f infra/host-nginx/game-arena-admin.conf /etc/nginx/snippets/game-arena-admin.conf
sudo_run cp -a "$tmp_site" "$SITE_AVAILABLE"
# If sites-enabled is a symlink, writing SITE_AVAILABLE is enough; otherwise copy.
if sudo_run test -L "$SITE_ENABLED"; then
  echo "sites-enabled is symlink → $(sudo_run readlink "$SITE_ENABLED" || true)"
else
  sudo_run cp -a "$tmp_site" "$SITE_ENABLED"
fi
rm -f "$tmp_site"

for broken in \
  /etc/nginx/sites-enabled/skillupshop.com \
  /etc/nginx/sites-enabled/watch-jalwa.com \
  /etc/nginx/conf.d/connection_upgrade.conf
do
  if sudo_run test -f "${broken}.bak.playeredge"; then
    echo "restoring $broken"
    sudo_run cp -a "${broken}.bak.playeredge" "$broken"
  fi
done
sudo_run bash -lc 'rm -f /etc/nginx/sites-enabled/*.bak.* /etc/nginx/sites-enabled/*bak* 2>/dev/null || true'

set +e
nginx_t_out="$(sudo_run nginx -t 2>&1)"
nginx_t_rc=$?
set -e
printf '%s\n' "$nginx_t_out"
if [ "$nginx_t_rc" -ne 0 ]; then
  echo "WARNING: nginx -t failed after heal (rc=$nginx_t_rc); static sync still OK" >&2
  exit 0
fi
sudo_run systemctl reload nginx 2>/dev/null || sudo_run systemctl restart nginx
sudo_run systemctl is-active nginx || true
echo "Local static sync + nginx heal complete for releaseSha=$EXPECTED_SHA"
