FROM nginxinc/nginx-unprivileged:1.31-alpine-slim@sha256:22f839c5fb4007dc24d203a170a9e03fc185d660bfefc34ac6823a7aef085cbc
USER root
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY deploy/40-game-arena-config.sh /docker-entrypoint.d/40-game-arena-config.sh
COPY --chown=101:101 . /usr/share/nginx/html
RUN cp /usr/share/nginx/html/index.html /usr/share/nginx/html/index.template.html \
 && chmod 755 /docker-entrypoint.d/40-game-arena-config.sh \
 && chown -R 101:101 /usr/share/nginx/html \
 && rm -rf /usr/share/nginx/html/deploy /usr/share/nginx/html/scripts /usr/share/nginx/html/node_modules /usr/share/nginx/html/Dockerfile /usr/share/nginx/html/package.json
USER 101
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
