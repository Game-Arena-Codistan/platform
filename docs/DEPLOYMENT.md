# Deployment and Recovery

## Environments

Use separate development, staging and production projects/accounts. Do not reuse databases, object-storage buckets, OTP senders, JazzCash merchant credentials, admin keys or analytics destinations.

## Components

- **Web:** immutable container/static files; `config.js` is generated at startup and must use a short/no-store cache.
- **API:** one writer replica in the current durable-state implementation, backed by PostgreSQL. Do not scale the API horizontally until operational state is migrated fully to normalized transactional repositories.
- **Game origin:** separate hostname and container/object-storage distribution for scanned immutable versions.
- **PostgreSQL:** managed production database with encrypted storage, point-in-time recovery and private networking.
- **Edge/CDN:** TLS, WAF/rate limits, `/api` routing to the API and static caching for web/game assets.

## Required production secrets

Create the Kubernetes secret `game-arena-secrets` or equivalent secret-manager entries for:

- `DATABASE_URL`
- `OTP_PRIMARY_ENDPOINT`, `OTP_PRIMARY_API_KEY`
- `OTP_SECONDARY_ENDPOINT`, `OTP_SECONDARY_API_KEY`
- `JAZZCASH_MERCHANT_ID`, `JAZZCASH_PASSWORD`, `JAZZCASH_INTEGRITY_SALT`, `JAZZCASH_ACTION_URL`, `JAZZCASH_RETURN_URL`, and webhook secret where applicable
- `ADMIN_API_KEYS` or the approved upstream admin identity gateway secret

Never commit values. Use environment-scoped secret access and rotate after any suspected exposure.

## Local/staging stack

```sh
cd infra
docker compose up --build
```

- Platform: `http://localhost:8080`
- Controlled game origin: `http://localhost:8082`
- Demo OTP: available only because the local stack explicitly enables debug OTP
- JazzCash: mock mode only

## Production release

1. Merge only with all required checks passing.
2. The release workflow publishes API, web and game-origin images tagged by commit SHA.
3. Create/verify a database backup or point-in-time restore marker.
4. Trigger the workflow manually with `deploy=true` and approve the production environment.
5. The workflow runs backwards-compatible migrations before applying manifests.
6. Verify API readiness, web health, game-origin health, sign-in, catalogue and an approved payment smoke test.
7. Start player rollout at the approved percentage.

The GitHub production environment requires `KUBE_CONFIG_B64`, `DATABASE_URL` and `PRODUCTION_HEALTH_URL`, plus a reviewer approval rule.

## Caching

- HTML and `config.js`: no-cache/no-store.
- Versioned web assets: short cache until filenames are content-hashed; then one-year immutable.
- Game files under `/games/<slug>/<version>/`: one-year immutable. Never replace a published version; publish a new version or use the kill switch.

## Rollback

### Web or API

1. Identify the last healthy commit SHA.
2. Set the deployment image to that SHA.
3. Wait for readiness and run smoke checks.
4. Do not roll back a database migration destructively. Migrations must remain backwards compatible through at least one application rollback window.

### Game

- Pause the catalogue item, set rollout to zero, or add the immutable version path to `disabled-games.map` and reload the origin.
- Point the catalogue active version to the previous verified version.
- Preserve the failed version and audit evidence.

### Payments

- Disable new checkout creation by setting `JAZZCASH_MODE=disabled` while preserving status lookup, callbacks and reconciliation.
- Do not grant premium manually from browser evidence. Reconcile provider records first.

## Backup and disaster recovery

Initial objectives: **RPO ≤15 minutes** and **RTO ≤2 hours**, subject to owner approval.

- Enable PostgreSQL point-in-time recovery and daily retained snapshots.
- Version and replicate approved game builds/manifests to a second storage location.
- Retain deployment manifests, image SHAs and checksums.
- Quarterly: restore the database to an isolated environment, start the API, verify account/entitlement/ledger integrity and document elapsed recovery time.

## Deployment verification

Record: commit SHA, image digests, migration versions, backup marker, approver, start/end time, health results, payment smoke reference, OTP provider status, catalogue count, rollback threshold and final decision.
