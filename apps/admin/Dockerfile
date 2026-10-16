FROM nginxinc/nginx-unprivileged:1.30-alpine-slim@sha256:e88d990b349df8cf4aa82f16642d7a23375016638c9ace4e5c6ca25028e62e65
USER root
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY 40-config.sh /docker-entrypoint.d/40-config.sh
COPY --chown=101:101 index.html app.js styles.css config.js /usr/share/nginx/html/
RUN chmod 755 /docker-entrypoint.d/40-config.sh && chown 101:101 /usr/share/nginx/html/config.js
USER 101
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
