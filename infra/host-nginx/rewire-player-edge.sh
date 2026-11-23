#!/usr/bin/env bash
# Rewire the public gsmarena-play.codistan.org host nginx edge so the player
# PWA is served from the Compose gateway (:8095) instead of a stale static tree.
set -euo pipefail

EXPECTED_SHA="${1:?expected release SHA required}"
COMPOSE_FILE="${COMPOSE_FILE:-infra/docker-compose.staging.yml}"
ENV_FILE="${ENV_FILE:-infra/.env}"
ROOT_DIR="${ROOT_DIR:-$(pwd)}"

cd "$ROOT_DIR"

gateway_config="$(curl --fail --silent --max-time 8 http://127.0.0.1:8095/config.js)"
printf '%s\n' "$gateway_config" | grep -Fq "releaseSha:\"$EXPECTED_SHA\"" || {
  echo "Gateway :8095/config.js does not contain releaseSha=$EXPECTED_SHA" >&2
  printf '%s\n' "$gateway_config" >&2
  exit 1
}

read_public_config() {
  curl --fail --silent --max-time 8 -k \
    --resolve gsmarena-play.codistan.org:443:127.0.0.1 \
    https://gsmarena-play.codistan.org/config.js
}

public_config="$(read_public_config || true)"
if printf '%s\n' "$public_config" | grep -Fq "releaseSha:\"$EXPECTED_SHA\""; then
  echo "Public edge already serves releaseSha=$EXPECTED_SHA"
  exit 0
fi

echo "Public edge is stale; rewiring host nginx player routes to gateway:8095"
printf 'gateway_config=%s\n' "$gateway_config"
printf 'public_config=%s\n' "$public_config"

sudo_run() {
  if command -v sudo >/dev/null 2>&1; then
    sudo -n "$@"
  else
    "$@"
  fi
}

sudo_run mkdir -p /etc/nginx/snippets
sudo_run cp -f infra/host-nginx/game-arena-admin.conf /etc/nginx/snippets/game-arena-admin.conf
sudo_run cp -f infra/host-nginx/game-arena-player.conf /etc/nginx/snippets/game-arena-player.conf

site_files="$(sudo_run grep -Rls 'gsmarena-play.codistan.org' /etc/nginx 2>/dev/null || true)"
if [ -z "$site_files" ]; then
  echo 'WARNING: no nginx site files mention gsmarena-play.codistan.org' >&2
else
  for site in $site_files; do
    echo "patching player edge in $site"
    sudo_run cp -a "$site" "$site.bak.playeredge"
    sudo_run python3 - "$site" <<'PY'
import pathlib
import re
import sys

path = pathlib.Path(sys.argv[1])
text = path.read_text(encoding='utf-8', errors='replace')
if 'gsmarena-play.codistan.org' not in text:
    raise SystemExit(0)

def ensure_include(content: str, snippet: str) -> str:
    marker = f'snippets/{snippet}'
    if marker in content:
        return content
    return re.sub(
        r'(server_name\s+[^\n]*gsmarena-play\.codistan\.org[^\n]*;)',
        rf'\1\n    include {marker};',
        content,
        count=1,
    )

text = ensure_include(text, 'game-arena-admin.conf')
text = ensure_include(text, 'game-arena-player.conf')

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
    r'^(\s*)root\s+([^;]*(?:apps/web|game-arena|gsmarena|/html)[^;]*);',
    r'\1# root \2; # disabled: player served via gateway 8095',
    text,
    flags=re.M,
)

path.write_text(text, encoding='utf-8')
print(f'rewrote {path}')
PY
  done
fi

# Belt-and-suspenders: refresh any leftover static config.js trees from the live web container.
compose=(docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE")
web_cid="$("${compose[@]}" ps -q web || true)"
if [ -n "$web_cid" ]; then
  mapfile -t static_configs < <(sudo_run find /opt/codistan /var/www -type f -name config.js 2>/dev/null | head -n 30 || true)
  for cfg in "${static_configs[@]:-}"; do
    [ -n "${cfg:-}" ] || continue
    if ! grep -q 'releaseSha' "$cfg" 2>/dev/null && ! sudo_run grep -q 'releaseSha' "$cfg" 2>/dev/null; then
      continue
    fi
    dir="$(dirname "$cfg")"
    echo "syncing web container html → $dir"
    tmp="$(mktemp -d)"
    docker cp "$web_cid:/usr/share/nginx/html/." "$tmp/"
    sudo_run cp -a "$tmp"/. "$dir"/
    rm -rf "$tmp"
  done
fi

if sudo_run nginx -t; then
  sudo_run systemctl reload nginx 2>/dev/null || sudo_run systemctl restart nginx 2>/dev/null || true
else
  echo 'ERROR: nginx -t failed after player edge rewire' >&2
  sudo_run nginx -T 2>/dev/null | grep -nE 'gsmarena-play|location /|root |proxy_pass|game-arena-player|game-arena-admin' | head -n 120 >&2 || true
  exit 1
fi

public_config="$(read_public_config)"
printf '%s\n' "$public_config" | grep -Fq "releaseSha:\"$EXPECTED_SHA\"" || {
  echo "Public edge config.js still does not match releaseSha=$EXPECTED_SHA after rewire" >&2
  printf '%s\n' "$public_config" >&2
  sudo_run nginx -T 2>/dev/null | grep -nE 'gsmarena-play|location /|root |proxy_pass|game-arena-player|game-arena-admin' | head -n 120 >&2 || true
  exit 1
}

echo "Public edge now serves releaseSha=$EXPECTED_SHA"
