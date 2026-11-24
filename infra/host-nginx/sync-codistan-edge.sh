#!/usr/bin/env bash
# Push the synced player html tree to the public DNS A-record host for
# gsmarena-play.codistan.org when that host is distinct from this deploy host.
# Also optionally retarget the Cloudflare A record when CLOUDFLARE_* is set in infra/.env.
set -euo pipefail

EXPECTED_SHA="${1:?expected release SHA required}"
ROOT_DIR="${ROOT_DIR:-$(pwd)}"
HTML_DIR="${HTML_DIR:-/opt/codistan/platform/.staging-web-html}"
STATIC_ROOT="${STATIC_ROOT:-/var/www/gsmarena-play.com/html}"
EDGE_HOST="${EDGE_HOST:-}"
DEPLOY_USER="${DEPLOY_USER:-$(id -un)}"

cd "$ROOT_DIR"

if [ ! -f "$HTML_DIR/config.js" ]; then
  echo "ERROR: missing $HTML_DIR/config.js — run rewire-player-edge.sh first" >&2
  exit 1
fi
grep -Fq "releaseSha:\"$EXPECTED_SHA\"" "$HTML_DIR/config.js"
grep -Fq 'tiktokPixelId' "$HTML_DIR/config.js"
grep -Fq 'game-arena-tiktok-pixel-id' "$HTML_DIR/index.html"

public_ip="$(getent ahostsv4 gsmarena-play.codistan.org 2>/dev/null | awk 'NR==1{print $1}' || true)"
echo "dns_a_record=${public_ip:-unknown}"
local_ips="$(hostname -I 2>/dev/null || true)"
echo "local_ips=${local_ips}"

cfg_com="$(curl --fail --silent --max-time 12 https://gsmarena-play.com/config.js || true)"
echo "gsmarena_play_com_config=${cfg_com}"
if printf '%s\n' "$cfg_com" | grep -Fq "releaseSha:\"$EXPECTED_SHA\""; then
  echo "DEPLOY_EDGE_OK=1 gsmarena-play.com already serves releaseSha=$EXPECTED_SHA"
else
  echo "WARNING: gsmarena-play.com does not yet show releaseSha=$EXPECTED_SHA" >&2
fi

cfg_codistan="$(curl --fail --silent --max-time 12 https://gsmarena-play.codistan.org/config.js || true)"
echo "gsmarena_play_codistan_config=${cfg_codistan}"
if printf '%s\n' "$cfg_codistan" | grep -Fq "releaseSha:\"$EXPECTED_SHA\"" \
  && printf '%s\n' "$cfg_codistan" | grep -Fq 'tiktokPixelId'; then
  echo "PUBLIC_EDGE_OK=1 gsmarena-play.codistan.org already serves releaseSha=$EXPECTED_SHA"
  exit 0
fi

# If DNS already points at this host, local static sync + nginx heal is enough.
if [ -n "$public_ip" ] && printf '%s\n' " $local_ips " | grep -Fq " $public_ip "; then
  echo "Public DNS A-record is local; relying on STATIC_ROOT sync."
  if [ -f "$STATIC_ROOT/config.js" ] && grep -Fq "releaseSha:\"$EXPECTED_SHA\"" "$STATIC_ROOT/config.js"; then
    echo "PUBLIC_EDGE_OK=1 local STATIC_ROOT matches"
    exit 0
  fi
fi

edge_target="${EDGE_HOST:-$public_ip}"
[ -n "$edge_target" ] || { echo 'ERROR: no public edge host to sync' >&2; exit 1; }
echo "edge_target=$edge_target"

ssh_try() {
  local identity="$1"
  local host="$2"
  local opts=(-o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=12)
  if [ -n "$identity" ] && [ -f "$identity" ]; then
    opts+=(-i "$identity")
  fi
  ssh "${opts[@]}" "${DEPLOY_USER}@${host}" 'echo ok'
}

push_html() {
  local identity="$1"
  local host="$2"
  local opts=(-o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20)
  if [ -n "$identity" ] && [ -f "$identity" ]; then
    opts+=(-i "$identity")
  fi
  tar -C "$HTML_DIR" -cf - . | ssh "${opts[@]}" "${DEPLOY_USER}@${host}" \
    "set -euo pipefail
     sudo -n mkdir -p '$STATIC_ROOT'
     sudo -n tar -C '$STATIC_ROOT' -xf -
     sudo -n grep -Fq 'releaseSha:\"$EXPECTED_SHA\"' '$STATIC_ROOT/config.js'
     sudo -n grep -Fq 'tiktokPixelId' '$STATIC_ROOT/config.js'
     sudo -n grep -Fq 'game-arena-tiktok-pixel-id' '$STATIC_ROOT/index.html'
     sudo -n nginx -t
     sudo -n systemctl reload nginx || sudo -n systemctl restart nginx
     echo EDGE_STATIC_SYNC_OK=1"
}

identities=()
for candidate in \
  "$HOME/.ssh/game-arena-staging" \
  "$HOME/.ssh/id_ed25519" \
  "$HOME/.ssh/id_rsa" \
  "$HOME/.ssh/id_ecdsa"
do
  [ -f "$candidate" ] && identities+=("$candidate")
done
identities+=("") # default agent/config identities

synced=0
for identity in "${identities[@]}"; do
  echo "Trying SSH to $edge_target identity=${identity:-default}"
  if ssh_try "$identity" "$edge_target" >/tmp/edge-ssh-ok.txt 2>/tmp/edge-ssh-err.txt; then
    echo "SSH to edge $edge_target succeeded"
    if push_html "$identity" "$edge_target"; then
      synced=1
      break
    fi
  else
    cat /tmp/edge-ssh-err.txt >&2 || true
  fi
done

# Optional: retarget Cloudflare DNS for gsmarena-play.codistan.org to this host's public IP.
read_env() {
  local key="$1"
  local value=""
  if [ -f infra/.env ]; then
    value="$(grep -m1 "^${key}=" infra/.env | cut -d= -f2- || true)"
    value="${value#\"}"; value="${value%\"}"
  fi
  printf '%s' "$value"
}

if [ "$synced" -ne 1 ]; then
  cf_token="$(read_env CLOUDFLARE_API_TOKEN)"
  cf_zone="$(read_env CLOUDFLARE_ZONE_ID)"
  origin_ip="$(curl --fail --silent --max-time 8 https://ifconfig.me/ip || curl --fail --silent --max-time 8 https://api.ipify.org || true)"
  echo "origin_public_ip=${origin_ip:-unknown}"
  if [ -n "$cf_token" ] && [ -n "$cf_zone" ] && [ -n "$origin_ip" ]; then
    echo "Attempting Cloudflare DNS upsert for gsmarena-play.codistan.org → $origin_ip (proxied)"
    records="$(curl --fail --silent --max-time 20 \
      -H "Authorization: Bearer $cf_token" \
      -H 'Content-Type: application/json' \
      "https://api.cloudflare.com/client/v4/zones/${cf_zone}/dns_records?type=A&name=gsmarena-play.codistan.org")"
    record_id="$(printf '%s' "$records" | python3 -c 'import json,sys; d=json.load(sys.stdin); r=d.get("result") or []; print(r[0]["id"] if r else "")')"
    payload="$(printf '{"type":"A","name":"gsmarena-play.codistan.org","content":"%s","ttl":120,"proxied":true}' "$origin_ip")"
    if [ -n "$record_id" ]; then
      curl --fail --silent --max-time 20 -X PUT \
        -H "Authorization: Bearer $cf_token" \
        -H 'Content-Type: application/json' \
        --data "$payload" \
        "https://api.cloudflare.com/client/v4/zones/${cf_zone}/dns_records/${record_id}" >/tmp/cf-dns.json
    else
      curl --fail --silent --max-time 20 -X POST \
        -H "Authorization: Bearer $cf_token" \
        -H 'Content-Type: application/json' \
        --data "$payload" \
        "https://api.cloudflare.com/client/v4/zones/${cf_zone}/dns_records" >/tmp/cf-dns.json
    fi
    python3 -c 'import json; d=json.load(open("/tmp/cf-dns.json")); assert d.get("success"), d; print("CLOUDFLARE_DNS_OK=1")'
    # Give DNS/proxy a moment, then re-check.
    sleep 8
    cfg_codistan="$(curl --fail --silent --max-time 20 https://gsmarena-play.codistan.org/config.js || true)"
    echo "gsmarena_play_codistan_config_after_dns=${cfg_codistan}"
    if printf '%s\n' "$cfg_codistan" | grep -Fq "releaseSha:\"$EXPECTED_SHA\""; then
      echo "PUBLIC_EDGE_OK=1 after Cloudflare DNS retarget"
      exit 0
    fi
  else
    echo "Cloudflare DNS retarget skipped (CLOUDFLARE_API_TOKEN / CLOUDFLARE_ZONE_ID / origin IP missing)."
  fi
fi

cfg_codistan="$(curl --fail --silent --max-time 20 https://gsmarena-play.codistan.org/config.js || true)"
echo "gsmarena_play_codistan_config_final=${cfg_codistan}"
if printf '%s\n' "$cfg_codistan" | grep -Fq "releaseSha:\"$EXPECTED_SHA\"" \
  && printf '%s\n' "$cfg_codistan" | grep -Fq 'tiktokPixelId'; then
  echo "PUBLIC_EDGE_OK=1"
  exit 0
fi

echo "ERROR: gsmarena-play.codistan.org still stale after local sync." >&2
echo "Deploy edge https://gsmarena-play.com already has the release; public DNS A=${public_ip} is a different host." >&2
echo "Fix one of: SSH key on ${edge_target}; CLOUDFLARE_API_TOKEN+CLOUDFLARE_ZONE_ID in infra/.env; or point gsmarena-play.codistan.org DNS at this host and terminate TLS (Cloudflare proxied)." >&2
exit 1
