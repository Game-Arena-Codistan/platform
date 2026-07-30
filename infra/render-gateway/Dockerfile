FROM nginxinc/nginx-unprivileged:1.29-alpine
COPY default.conf.template /etc/nginx/templates/default.conf.template
EXPOSE 10000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s CMD wget -q -O /dev/null http://127.0.0.1:${PORT:-10000}/healthz || exit 1
