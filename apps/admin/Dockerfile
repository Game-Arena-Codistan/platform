FROM nginxinc/nginx-unprivileged:1.31-alpine-slim@sha256:22f839c5fb4007dc24d203a170a9e03fc185d660bfefc34ac6823a7aef085cbc
USER root
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY 40-config.sh /docker-entrypoint.d/40-config.sh
COPY --chown=101:101 index.html app.js styles.css config.js /usr/share/nginx/html/
RUN chmod 755 /docker-entrypoint.d/40-config.sh && chown 101:101 /usr/share/nginx/html/config.js
USER 101
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
