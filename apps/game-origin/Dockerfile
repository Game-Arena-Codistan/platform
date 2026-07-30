FROM nginxinc/nginx-unprivileged:1.29-alpine
USER root
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --chown=101:101 public /usr/share/nginx/html
USER 101
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
