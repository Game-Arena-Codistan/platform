FROM node:26.8-alpine3.24@sha256:ef24c5053d50fdc3e4e56eb4e7ddb7861874ab0fdc797046ba897581deb8e868
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund \
 && npm cache clean --force \
 && mkdir -p /app/certs \
 && wget -q -O /app/certs/rds-global-bundle.pem https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem \
 && test -s /app/certs/rds-global-bundle.pem \
 && chown -R node:node /app/certs
COPY --chown=node:node src ./src
COPY --chown=node:node scripts ./scripts
COPY --chown=node:node migrations ./migrations
USER node
EXPOSE 8081
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s CMD wget -q -O /dev/null http://127.0.0.1:8081/healthz || exit 1
CMD ["node","src/server.mjs"]
