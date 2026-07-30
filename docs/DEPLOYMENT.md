# Deployment and recovery

## Environments

Use separate development, staging and production accounts/projects. Do not reuse databases, object-storage buckets, OTP senders, JazzCash merchant credentials, admin keys, TLS keys or analytics destinations.

GitHub Environments hold cloud-specific variables, secrets and required reviewers. Repository files contain no production credentials.

## Components

- **Web:** immutable container/static files; `config.js` is generated at startup and must use a short/no-store cache.
- **API:** one writer replica in the current durable-state implementation, backed by PostgreSQL. Do not scale API writes horizontally until operational state is fully migrated to normalized transactional repositories.
- **Admin:** private operations console. Do not expose its Kubernetes service directly to the public internet.
- **Game origin:** separate hostname and container/object-storage distribution for scanned immutable versions.
- **PostgreSQL:** managed database with encrypted storage, point-in-time recovery and private networking.
- **Edge:** DigitalOcean Gateway API or AWS ALB provides TLS and routes `/api` to the API while preserving a separate game hostname.

## Delivery workflows

- `.github/workflows/vercel-preview.yml` — frontend-only pull-request previews in mock mode.
- `.github/workflows/release.yml` — builds and publishes commit-addressed API, web, admin and game-origin images to GHCR.
- `.github/workflows/deploy-kubernetes.yml` — manually deploys a published image tag to DigitalOcean Kubernetes or AWS EKS.

See `docs/CLOUD-DEPLOYMENT.md` for the full variables/secrets matrix and provider prerequisites.

## Required runtime secrets

The deployment workflow creates or updates Kubernetes secret `game-arena-secrets` from the selected GitHub Environment:

- `DATABASE_URL`
- `OTP_PRIMARY_ENDPOINT`, `OTP_PRIMARY_API_KEY`
- `OTP_SECONDARY_ENDPOINT`, `OTP_SECONDARY_API_KEY`
- `JAZZCASH_MERCHANT_ID`, `JAZZCASH_PASSWORD`, `JAZZCASH_INTEGRITY_SALT`, `JAZZCASH_ACTION_URL`, `JAZZCASH_RETURN_URL`, `JAZZCASH_WEBHOOK_SECRET`
- `ADMIN_API_KEYS`

A separate `ghcr-pull` secret is generated from a read-only package credential. Never commit or print secret values.

## Local stack

```sh
cd infra
docker compose up --build
```

- Platform: `http://localhost:8080`
- Controlled game origin: `http://localhost:8082`
- Operations console: `http://localhost:8083`
- Demo OTP: available only because the local stack explicitly enables debug OTP
- JazzCash: mock mode only

## Staging release

1. Merge only with all required checks passing.
2. Wait for **Build and publish images** on `main`.
3. Configure the `staging` GitHub Environment and cloud prerequisites.
4. Run **Deploy Kubernetes**, choosing DigitalOcean or AWS and `staging`.
5. The workflow verifies the release images and cluster capabilities.
6. It creates image-pull/application secrets, renders manifests and runs the backwards-compatible migration job.
7. It applies the application and provider-specific edge, waits for rollouts and checks service health.
8. Point the two DNS hostnames to the workflow-reported load balancer.
9. Execute `docs/QUALIFICATION.md` and record evidence in issue #41.

Staging may use mock OTP and JazzCash. Debug OTP must remain limited to approved testers.

## Production release

1. Complete provider, legal, security and manual qualification gates.
2. Configure the `production` GitHub Environment with mandatory reviewers.
3. Confirm database backup/PITR readiness and the rollback image SHA.
4. Run **Deploy Kubernetes**, selecting `production`.
5. Production safety checks reject mock OTP, debug OTP and mock JazzCash.
6. Verify API readiness, web health, game-origin health, sign-in, catalogue and an approved payment smoke test.
7. Start the controlled rollout at the approved percentage.

Production may keep OTP or JazzCash disabled while a provider is unavailable, but the unavailable journey must be hidden/disabled and documented in the go/no-go record.

## Caching

- HTML and `config.js`: no-cache/no-store.
- Versioned web assets: short cache until filenames are content-hashed; then one-year immutable.
- Game files under `/games/<slug>/<version>/`: one-year immutable. Never replace a published version; publish a new version or use the kill switch.

## Rollback

### Web, API or admin

1. Identify the last healthy published commit SHA.
2. Run **Deploy Kubernetes** with that SHA in `image_tag`.
3. Wait for the migration compatibility check and application rollout.
4. Run health and critical-journey smoke tests.
5. Do not reverse a database migration destructively. Migrations must remain compatible through at least one application rollback window.

### Game

- Pause the catalogue item, set rollout to zero, or add the immutable version path to `disabled-games.map` and reload the origin.
- Point the catalogue active version to the previous verified version.
- Preserve the failed version and audit evidence.

### Payments

- Disable new checkout creation by setting `JAZZCASH_MODE=disabled` and redeploying while preserving status lookup, callbacks and reconciliation.
- Do not grant premium from browser evidence. Reconcile provider records first.

## Backup and disaster recovery

Initial objectives: **RPO ≤15 minutes** and **RTO ≤2 hours**, subject to owner approval and the selected managed database plan.

- Enable PostgreSQL point-in-time recovery and daily retained snapshots.
- Version and replicate approved game builds/manifests to a second storage location.
- Retain deployment manifests, image SHAs, image digests and checksums.
- Quarterly: restore the database to an isolated environment, start the API, verify account/entitlement/ledger integrity and document elapsed recovery time.

## Deployment verification record

Record the provider, GitHub Environment, commit SHA, image digests, migration versions, backup marker, approver, start/end time, load-balancer address, DNS/TLS state, health results, payment smoke reference, OTP provider status, catalogue count, rollback threshold and final decision.
