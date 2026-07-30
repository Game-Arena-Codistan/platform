#!/bin/sh
set -eu
API=${GAME_ARENA_ADMIN_API_BASE_URL:-/api}
MODE=${GAME_ARENA_ADMIN_AUTH_MODE:-gateway}
cat > /usr/share/nginx/html/config.js <<EOF
window.GAME_ARENA_ADMIN_CONFIG={apiBaseUrl:"${API}",authMode:"${MODE}"};
EOF
