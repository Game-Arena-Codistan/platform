FROM nginxinc/nginx-unprivileged:1.29-alpine
ENV PORT=8080 \
    GAME_ARENA_FRAME_ANCESTORS="https://gamearena.pk https://*.gamearena.pk" \
    GAME_ARENA_ARTIFACT_ORIGIN="http://127.0.0.1:9"
USER root
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY disabled-games.map /etc/nginx/conf.d/disabled-games.map
COPY --chown=101:101 public /usr/share/nginx/html
RUN chown 101:101 /etc/nginx/conf.d/disabled-games.map
USER 101
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O /dev/null http://127.0.0.1:${PORT:-8080}/healthz || exit 1
