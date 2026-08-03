#!/bin/sh
set -eu
MODE=${GAME_ARENA_MODE:-mock}
API=${GAME_ARENA_API_BASE_URL:-}
ORIGIN=${GAME_ARENA_GAME_ORIGIN:-}
HOSTS=${GAME_ARENA_GAME_HOSTS:-}
RELEASE=${GAME_ARENA_RELEASE_SHA:-dev}
ANALYTICS=${GAME_ARENA_ANALYTICS_ENDPOINT:-/api/v1/events}
case "$MODE" in mock|live) ;; *) echo 'Invalid GAME_ARENA_MODE' >&2; exit 1;; esac
case "$RELEASE" in *[!A-Za-z0-9._-]*|'') echo 'Invalid GAME_ARENA_RELEASE_SHA' >&2; exit 1;; esac
case "$ORIGIN" in
  '') GAME_SOURCE='' ;;
  https://*) GAME_SOURCE=$(printf '%s' "$ORIGIN" | sed -E 's#^(https://[^/]+).*$#\1#') ;;
  http://localhost:*|http://127.0.0.1:*)
    [ "$RELEASE" = dev ] || { echo 'HTTP game origin is allowed only for the local dev release' >&2; exit 1; }
    GAME_SOURCE=$(printf '%s' "$ORIGIN" | sed -E 's#^(http://[^/]+).*$#\1#')
    ;;
  *) echo 'GAME_ARENA_GAME_ORIGIN must be HTTPS except for local dev Compose' >&2; exit 1 ;;
esac
for value in "$API" "$ORIGIN" "$HOSTS" "$ANALYTICS"; do case "$value" in *'"'*|*\\*|*'
'*|*''*) echo 'Runtime configuration contains unsafe characters' >&2; exit 1;; esac; done
cat > /usr/share/nginx/html/config.js <<EOF
window.GAME_ARENA_CONFIG={mode:"${MODE}",apiBaseUrl:"${API}",gameOrigin:"${ORIGIN}",gameHosts:"${HOSTS}".split(',').map(value=>value.trim()).filter(Boolean),releaseSha:"${RELEASE}",analyticsEndpoint:"${ANALYTICS}"};
EOF
cp /usr/share/nginx/html/index.template.html /usr/share/nginx/html/index.html
if [ -n "$GAME_SOURCE" ]; then
  sed -i "s#frame-src 'self';#frame-src 'self' ${GAME_SOURCE};#" /usr/share/nginx/html/index.html
  sed -i "s#img-src 'self' data:;#img-src 'self' data: ${GAME_SOURCE};#" /usr/share/nginx/html/index.html
fi
sed -i "s#/src/app.js#/src/app.js?v=${RELEASE}#" /usr/share/nginx/html/index.html
sed -i "s#/styles/tokens.css#/styles/tokens.css?v=${RELEASE}#;s#/styles/app.css#/styles/app.css?v=${RELEASE}#;s#/styles/responsive.css#/styles/responsive.css?v=${RELEASE}#" /usr/share/nginx/html/index.html
