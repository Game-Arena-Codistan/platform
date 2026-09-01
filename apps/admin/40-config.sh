#!/bin/sh
set -eu
API=${GAME_ARENA_ADMIN_API_BASE_URL:-/api}
MODE=${GAME_ARENA_ADMIN_AUTH_MODE:-gateway}
case "$MODE" in
  gateway|signed-headers) CLIENT_MODE=gateway ;;
  local-key) CLIENT_MODE=local-key ;;
  *) echo 'Invalid GAME_ARENA_ADMIN_AUTH_MODE' >&2; exit 1 ;;
esac
cat > /usr/share/nginx/html/config.js <<EOF
window.GAME_ARENA_ADMIN_CONFIG={apiBaseUrl:"${API}",authMode:"${CLIENT_MODE}"};
EOF
