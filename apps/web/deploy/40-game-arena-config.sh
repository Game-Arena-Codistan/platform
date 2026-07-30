#!/bin/sh
set -eu
MODE=${GAME_ARENA_MODE:-mock}
API=${GAME_ARENA_API_BASE_URL:-}
ORIGIN=${GAME_ARENA_GAME_ORIGIN:-}
HOSTS=${GAME_ARENA_GAME_HOSTS:-games.codistan.org}
cat > /usr/share/nginx/html/config.js <<EOF
window.GAME_ARENA_CONFIG={mode:"${MODE}",apiBaseUrl:"${API}",gameOrigin:"${ORIGIN}",gameHosts:"${HOSTS}".split(',').map(value=>value.trim()).filter(Boolean)};
EOF
