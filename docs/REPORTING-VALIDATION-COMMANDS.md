# Reporting candidate validation commands

The authoritative validation target is the pull-request head SHA recorded in the PR.

Run the repository checks from an isolated checkout of that SHA:

```text
node scripts/security-check.mjs
node scripts/check-pre-staging.mjs
node scripts/check-cloud-deployment.mjs
```

Run the API suite, including reporting and admin security regressions:

```text
cd apps/api
npm ci --ignore-scripts --no-audit --no-fund
npm run ci
```

Run clean PostgreSQL migrations and durability tests using PostgreSQL 16, then validate the full production containers, player browser matrix, Compose configuration and OpenTofu exactly as described in `docs/PRE-STAGING-GATE.md`.

Record the exact SHA, summary, logs and evidence ZIP on the pull request and #48. Never record credentials or customer data.
