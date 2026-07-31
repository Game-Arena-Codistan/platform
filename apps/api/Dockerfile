FROM node:22.23.1-alpine3.24@sha256:b74031e546d7f4faf561d797ac1b76beccac856a042815ca77db4fd047581605
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
