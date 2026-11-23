#!/usr/bin/env bash
# Rewire the public staging host nginx edge so the player PWA is served from the
# Compose gateway (:8095), and refresh any leftover static html tree.
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

read_sni_config() {
  curl --fail --silent --max-time 8 -k \
    --resolve gsmarena-play.codistan.org:443:127.0.0.1 \
    https://gsmarena-play.codistan.org/config.js
}

read_public_dns_config() {
  # Hairpin through public DNS from the staging host (not 127.0.0.1).
  curl --fail --silent --max-time 8 https://gsmarena-play.codistan.org/config.js
}

echo "=== host identity ==="
hostname -f 2>/dev/null || hostname || true
hostname -I 2>/dev/null || true
ip -4 addr show scope global 2>/dev/null | awk '/inet /{print $2}' || true

sni_config="$(read_sni_config || true)"
dns_config="$(read_public_dns_config || true)"
printf 'sni_config=%s\n' "$sni_config"
printf 'dns_config=%s\n' "$dns_config"

sni_ok=0
dns_ok=0
printf '%s\n' "$sni_config" | grep -Fq "releaseSha:\"$EXPECTED_SHA\"" && sni_ok=1 || true
printf '%s\n' "$dns_config" | grep -Fq "releaseSha:\"$EXPECTED_SHA\"" && dns_ok=1 || true

if [ "$sni_ok" = 1 ] && [ "$dns_ok" = 1 ]; then
  echo "Public SNI and DNS edges already serve releaseSha=$EXPECTED_SHA"
  exit 0
fi

echo "Public edge stale (sni_ok=$sni_ok dns_ok=$dns_ok); rewiring host nginx + syncing static root"

sudo_run mkdir -p /etc/nginx/snippets
sudo_run cp -f infra/host-nginx/game-arena-admin.conf /etc/nginx/snippets/game-arena-admin.conf
sudo_run cp -f infra/host-nginx/game-arena-player.conf /etc/nginx/snippets/game-arena-player.conf

# Known staging vhost + any site that mentions the staging hostnames or static root.
mapfile -t site_files < <(
  {
    sudo_run bash -lc 'ls -1 /etc/nginx/sites-enabled/* /etc/nginx/conf.d/* 2>/dev/null' || true
    sudo_run grep -Rls -E 'gsmarena-play\.(codistan\.org|com)|/var/www/gsmarena-play\.com/html' /etc/nginx 2>/dev/null || true
  } | awk 'NF' | sort -u
)

if [ "${#site_files[@]}" -eq 0 ]; then
  echo 'WARNING: no nginx site files found for gsmarena-play' >&2
else
  for site in "${site_files[@]}"; do
    [ -f "$site" ] || continue
    # Never rewrite the snippets themselves as "sites".
    case "$site" in
      */snippets/*) continue ;;
    esac
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
    # Fallback: insert after first server { for this file.
    return re.sub(r'(server\s*\{)', rf'\1\n    include {marker};', content, count=1)

text = ensure_include(text, 'game-arena-admin.conf')
text = ensure_include(text, 'game-arena-player.conf')

# Ensure staging hostname is accepted by the production-named vhost.
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

# Old direct admin upstreams still break /admin on this host.
text = re.sub(
    r'proxy_pass\s+http://(?:localhost|127\.0\.0\.1):(8083|18183)/?\s*;',
    'proxy_pass http://127.0.0.1:8095;',
    text,
)

text = re.sub(
    r'^(\s*)root\s+([^;]*/var/www/gsmarena-play\.com/html[^;]*);',
    r'\1# root \2; # disabled: player served via gateway 8095',
    text,
    flags=re.M,
)

if text != original:
    path.write_text(text, encoding='utf-8')
    print(f'rewrote {path}')
else:
    print(f'no structural rewrite needed for {path}')
PY
  done
fi

# Always refresh the known static tree from the live web container.
compose=(docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE")
web_cid="$("${compose[@]}" ps -q web || true)"
if [ -z "$web_cid" ]; then
  echo 'ERROR: web container id unavailable for static sync' >&2
  exit 1
fi

sync_dirs=("$STATIC_ROOT")
mapfile -t discovered < <(sudo_run find /var/www /opt/codistan -type f -name config.js 2>/dev/null | head -n 40 || true)
for cfg in "${discovered[@]:-}"; do
  [ -n "${cfg:-}" ] || continue
  sync_dirs+=("$(dirname "$cfg")")
done

tmp="$(mktemp -d)"
docker cp "$web_cid:/usr/share/nginx/html/." "$tmp/"
# Deduplicate destinations.
mapfile -t sync_dirs < <(printf '%s\n' "${sync_dirs[@]}" | awk 'NF' | sort -u)
for dir in "${sync_dirs[@]}"; do
  echo "syncing web container html → $dir"
  sudo_run mkdir -p "$dir"
  sudo_run cp -a "$tmp"/. "$dir"/
done
rm -rf "$tmp"

if sudo_run nginx -t; then
  sudo_run systemctl reload nginx 2>/dev/null || sudo_run systemctl restart nginx 2>/dev/null || true
else
  echo 'ERROR: nginx -t failed after player edge rewire' >&2
  sudo_run nginx -T 2>/dev/null | grep -nE 'gsmarena-play|location /|root |proxy_pass|game-arena-player|game-arena-admin' | head -n 160 >&2 || true
  exit 1
fi

sni_config="$(read_sni_config)"
dns_config="$(read_public_dns_config || true)"
printf 'sni_config_after=%s\n' "$sni_config"
printf 'dns_config_after=%s\n' "$dns_config"

printf '%s\n' "$sni_config" | grep -Fq "releaseSha:\"$EXPECTED_SHA\"" || {
  echo "SNI edge config.js still does not match releaseSha=$EXPECTED_SHA after rewire" >&2
  sudo_run nginx -T 2>/dev/null | grep -nE 'gsmarena-play|location /|root |proxy_pass|game-arena-player|game-arena-admin' | head -n 160 >&2 || true
  exit 1
}

if [ -n "$dns_config" ]; then
  printf '%s\n' "$dns_config" | grep -Fq "releaseSha:\"$EXPECTED_SHA\"" || {
    echo "DNS edge config.js still does not match releaseSha=$EXPECTED_SHA after rewire" >&2
    exit 1
  }
fi

echo "Public edge now serves releaseSha=$EXPECTED_SHA"
