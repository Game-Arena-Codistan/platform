#!/usr/bin/env bash
# Rewire the public staging host nginx edge so the player PWA is served from the
# Compose gateway (:8095), and refresh the known static html tree.
set -euo pipefail

EXPECTED_SHA="${1:?expected release SHA required}"
COMPOSE_FILE="${COMPOSE_FILE:-infra/docker-compose.staging.yml}"
ENV_FILE="${ENV_FILE:-infra/.env}"
ROOT_DIR="${ROOT_DIR:-$(pwd)}"
STATIC_ROOT="${STATIC_ROOT:-/var/www/gsmarena-play.com/html}"

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

read_sni_loopback() {
  curl --fail --silent --max-time 8 -k \
    --resolve gsmarena-play.codistan.org:443:127.0.0.1 \
    https://gsmarena-play.codistan.org/config.js
}

read_sni_on_ip() {
  local ip="$1"
  curl --fail --silent --max-time 8 -k \
    --resolve "gsmarena-play.codistan.org:443:${ip}" \
    https://gsmarena-play.codistan.org/config.js
}

echo "=== host identity ==="
hostname -f 2>/dev/null || hostname || true
hostname -I 2>/dev/null || true
mapfile -t host_ips < <(hostname -I 2>/dev/null | tr ' ' '\n' | awk 'NF' || true)
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
rm -rf "$tmp"
echo "static_config_after_sync=$(sudo_run head -c 400 "$STATIC_ROOT/config.js" || true)"
sudo_run grep -Fq "releaseSha:\"$EXPECTED_SHA\"" "$STATIC_ROOT/config.js" || {
  echo "ERROR: ${STATIC_ROOT}/config.js missing expected SHA after sync" >&2
  exit 1
}

echo "=== patch only gsmarena-play nginx site files ==="
sudo_run mkdir -p /etc/nginx/snippets
sudo_run cp -f infra/host-nginx/game-arena-admin.conf /etc/nginx/snippets/game-arena-admin.conf
sudo_run cp -f infra/host-nginx/game-arena-player.conf /etc/nginx/snippets/game-arena-player.conf

mapfile -t site_files < <(
  sudo_run bash -lc 'ls -1 /etc/nginx/sites-enabled/gsmarena-play.com /etc/nginx/sites-available/gsmarena-play.com 2>/dev/null' \
    | awk 'NF' \
    | sort -u
)

if [ "${#site_files[@]}" -eq 0 ]; then
  echo 'WARNING: gsmarena-play.com site file not found' >&2
else
  for site in "${site_files[@]}"; do
    [ -f "$site" ] || continue
    echo "patching player edge in $site"
    sudo_run cp -a "$site" "$site.bak.playeredge"
    sudo_run python3 - "$site" <<'PY'
import pathlib
import re
import sys

path = pathlib.Path(sys.argv[1])
text = path.read_text(encoding='utf-8', errors='replace')
original = text

def ensure_include(content: str, snippet: str) -> str:
    marker = f'snippets/{snippet}'
    if marker in content:
        return content
    replaced = re.sub(
        r'(server_name\s+[^\n]*gsmarena-play\.(?:codistan\.org|com)[^\n]*;)',
        rf'\1\n    include {marker};',
        content,
        count=1,
    )
    if replaced != content:
        return replaced
    return re.sub(r'(server\s*\{)', rf'\1\n    include {marker};', content, count=1)

text = ensure_include(text, 'game-arena-admin.conf')
text = ensure_include(text, 'game-arena-player.conf')

if 'gsmarena-play.codistan.org' not in text and 'gsmarena-play.com' in text:
    text = re.sub(
        r'(server_name\s+)([^;]*gsmarena-play\.com[^;]*);',
        r'\1\2 gsmarena-play.codistan.org;',
        text,
        count=1,
    )

def comment_static_location(match):
    block = match.group(0)
    if '8095' in block and 'proxy_pass' in block:
        return block
    if 'game-arena-player.conf' in block:
        return block
    commented = '\n'.join(
        (line if not line.strip() else f'# {line}')
        for line in block.splitlines()
    )
    return '# disabled stale static player location; gateway snippet owns /\n' + commented

text = re.sub(
    r'location\s+/\s*\{(?:[^{}]|\{[^{}]*\})*\}',
    comment_static_location,
    text,
    flags=re.M,
)

text = re.sub(
    r'proxy_pass\s+http://(?:localhost|127\.0\.0\.1):(8083|18183)/?\s*;',
    'proxy_pass http://127.0.0.1:8095;',
    text,
)

# Keep root for certbot/other locations, but player / is proxied via snippet.
if text != original:
    path.write_text(text, encoding='utf-8')
    print(f'rewrote {path}')
else:
    print(f'no structural rewrite needed for {path}')
PY
  done
fi

echo "=== restore unrelated vhosts if an earlier recovery corrupted them ==="
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

echo "=== nginx -t / reload ==="
if ! sudo_run nginx -t; then
  echo 'ERROR: nginx -t failed after player edge rewire' >&2
  sudo_run nginx -T 2>/dev/null | grep -nE 'gsmarena-play|location /|root |proxy_pass|game-arena-player|game-arena-admin' | head -n 200 >&2 || true
  exit 1
fi
sudo_run systemctl reload nginx 2>/dev/null || sudo_run systemctl restart nginx

echo "=== probe loopback + host IPs + DNS A ==="
sni_loopback="$(read_sni_loopback || true)"
printf 'sni_loopback=%s\n' "$sni_loopback"
printf '%s\n' "$sni_loopback" | grep -Fq "releaseSha:\"$EXPECTED_SHA\"" || {
  echo 'ERROR: loopback SNI edge still stale after rewire' >&2
  exit 1
}

probe_ips=("${host_ips[@]:-}")
if [ -n "${public_ip:-}" ]; then
  probe_ips+=("$public_ip")
fi
mapfile -t probe_ips < <(printf '%s\n' "${probe_ips[@]:-}" | awk 'NF' | sort -u)

for ip in "${probe_ips[@]}"; do
  cfg="$(read_sni_on_ip "$ip" || true)"
  printf 'sni_on_%s=%s\n' "$ip" "$cfg"
  printf '%s\n' "$cfg" | grep -Fq "releaseSha:\"$EXPECTED_SHA\"" || {
    echo "ERROR: SNI edge on ${ip} still stale after rewire/sync" >&2
    echo "static_root_config=$(sudo_run cat "$STATIC_ROOT/config.js" || true)" >&2
    sudo_run nginx -T 2>/dev/null | grep -nE 'gsmarena-play|listen |server_name|location /|root |proxy_pass|game-arena-player' | head -n 220 >&2 || true
    exit 1
  }
done

echo "Public edge now serves releaseSha=$EXPECTED_SHA on loopback and host/public IPs"
