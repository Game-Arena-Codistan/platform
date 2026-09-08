# Deployment and recovery

## Active deployment target

The active Game Arena staging/launch target is the existing **self-managed/local-server Docker Compose environment**.

Do not provision AWS, EKS, S3, RDS, Route 53 or AWS IAM roles for the current launch unless the project owner explicitly changes the infrastructure decision.

Current staging URL: `https://gsmarena-play.codistan.org`

Current runtime stack:

- `postgres` — persistent PostgreSQL data volume;
- `migrate` — exact-release migration runner;
- `api` — Game Arena modular-monolith API/BFF;
- `web` — player PWA;
- `admin` — private operations console, bound locally on the server;
- `game-origin` — controlled game origin with persistent host-mounted game content;
- `gateway` — public reverse-proxy entry point.

The canonical staging definition is `infra/docker-compose.staging.yml`.

## Active release flow

`reviewed main SHA → Build and publish images → exact-SHA Docker images → deploy.yml → local staging Compose → health/identity checks → automated staging certification → READY FOR UAT → human UAT`

Relevant workflows:

- `.github/workflows/vercel-preview.yml` — frontend-only mock preview;
- `.github/workflows/release.yml` — immutable SHA-addressed image publication;
- `.github/workflows/deploy.yml` — active staging deployment to the self-managed server;
- `.github/workflows/aws-staging-certification.yml` — historical filename retained, but currently certifies the Compose staging host.

Issue #48 is the authoritative deployment/UAT/production-approval gate.

## Server layout and persistence

The staging deployment operates from `/opt/codistan/platform`.

Important persistent state:

- PostgreSQL volume — must survive application/container replacement;
- `/opt/codistan/platform/game-content/games` — immutable controlled game files, mounted read-only into game-origin;
- protected `infra/.env` or equivalent server-side environment file — never copied from source control;
- `.deployed-sha` — records the exact deployed application SHA for certification.

Do not delete or recreate persistent database/game-content state as part of a routine application deploy.

## Configuration

The Compose stack reads runtime configuration from the protected server environment. Never commit secret values.

Core staging configuration includes:

- public/allowed origins;
- PostgreSQL password/connection material;
- OTP provider mode and provider credentials when applicable;
- Admin signed-role material;
- external Payment Service configuration;
- legacy/top-up JazzCash settings only where an unrelated legacy path still requires them.

For Game Arena+ external billing, see `docs/PAYMENT-SERVICE-INTEGRATION.md`.

Required external-billing server variables are:

```text
PAYMENT_SERVICE_MODE=external
PAYMENT_SERVICE_URL=...
PAYMENT_SERVICE_API_KEY=...
PAYMENT_SERVICE_WEBHOOK_SECRET=...
PAYMENT_SERVICE_APP_RETURN_URL=https://gsmarena-play.codistan.org/#/premium
PAYMENT_SERVICE_TIMEOUT_MS=8000
```

Keep `PAYMENT_SERVICE_MODE=disabled` until the real staging Payment Service values are installed. No Payment Service API key or webhook secret belongs in browser config.

## Staging deployment sequence

1. Merge only a reviewed/qualified change.
2. Confirm `Build and publish images` succeeds for the exact main SHA.
3. Let `deploy.yml` deploy that same SHA to the existing staging server.
4. Verify Compose resolves application services to the exact SHA tag, never mutable `latest`.
5. Run migrations through the release migration service.
6. Verify API, web, Admin and controlled game-origin health.
7. Verify database/game-content persistence and restart recovery.
8. Run the complete automated staging certification.
9. Require `READY FOR UAT` before human UAT starts.
10. If manual UAT finds a code defect, merge the fix normally and repeat the exact-SHA deployment/certification sequence.

## Production preparation

A staging PASS is not production authorization.

Before any production change:

- real Payment Service/JazzCash staging UAT must pass if paid launch is in scope;
- manual UAT must pass on the exact final SHA;
- no unresolved critical/high launch defect may remain;
- production configuration, domain/TLS, database/content backup and rollback target must be verified;
- the project owner must explicitly authorize production execution.

After approval, production must receive the **same immutable application SHA/artifacts** accepted in staging. Do not rebuild a different release for production.

See `docs/PRODUCTION-CUTOVER.md` and `docs/GO-LIVE.md`.

## Rollback

### Application

- retain the previous known-good production/staging SHA and image references;
- restore the prior immutable application artifacts when rollback is required;
- do not perform destructive database rollback blindly;
- prefer compatible forward fixes or the documented database restore procedure.

### Games

- pause a title, set rollout to zero or activate the exact-version kill switch;
- restore the previous verified immutable game version;
- preserve failed-build evidence for diagnosis.

### Payments

- disable new payment initiation through an approved operational change if necessary;
- continue safe webhook/status reconciliation where possible;
- never grant Premium from browser return state, screenshots or manual client claims.

## Backup/recovery minimum

Before production approval, prove:

- database backup and restore procedure;
- persistent game-content backup/recovery procedure;
- application rollback to a known-good SHA;
- restart recovery for Compose services;
- domain/TLS recovery ownership;
- payment disable/reconciliation procedure.

## Historical AWS assets

`infra/opentofu/aws`, Kubernetes manifests and AWS workflows remain in the repository for historical/reference or a possible future infrastructure lane. They are **not the active deployment instructions**.

`docs/AWS-DEPLOYMENT.md` is intentionally marked historical/optional and must not be used for the current launch without a new approved infrastructure decision.