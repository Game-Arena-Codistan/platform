# Pre-staging deployment gate

## Current purpose

This document defines the pre-staging gate for the **active self-managed/local-server Docker Compose lane**.

AWS/EKS/S3 provisioning is not a prerequisite for the current staging environment.

## Release boundary

Deploy one exact full commit SHA from `main` through the normal release/deployment path. Do not deploy arbitrary branch heads or mutable `latest` images.

Before deployment:

- required PR/CI checks must pass;
- database migrations must be reviewed and backwards-compatible for the rollback window;
- secrets must remain server-side and outside Git;
- persistent PostgreSQL and game-content paths must not be destroyed by the deploy;
- the target SHA must be the same SHA used by immutable image publication.

## PostgreSQL boundary

The staging API uses PostgreSQL as the durable runtime source of truth. Migration and restart/concurrency tests must remain green.

Run applicable repository checks before staging:

```bash
node scripts/check-pre-staging.mjs
node scripts/check-postgres-staging-readiness.mjs
node scripts/security-check.mjs
```

Do not waive persistence or transactional checks to obtain a green deployment.

## Active staging configuration

The protected runtime configuration belongs on the self-managed server, not in repository content.

Core values include:

- `PUBLIC_ORIGIN`
- `ALLOWED_ORIGINS`
- `POSTGRES_PASSWORD` / database connection material
- OTP provider configuration
- Admin signed-role configuration
- Payment Service configuration
- top-up/voucher/provider values only when those features require them

External Premium billing remains disabled until the real staging Payment Service values are available.

When enabling it, configure only on the API/server:

```text
PAYMENT_SERVICE_MODE=external
PAYMENT_SERVICE_URL=...
PAYMENT_SERVICE_API_KEY=...
PAYMENT_SERVICE_WEBHOOK_SECRET=...
PAYMENT_SERVICE_APP_RETURN_URL=https://gsmarena-play.codistan.org/#/premium
PAYMENT_SERVICE_TIMEOUT_MS=8000
```

Expected webhook target:

`https://gsmarena-play.codistan.org/api/v1/webhooks/payments`

Never commit or paste secret values.

## Controlled staging sequence

1. Run the complete repository/PR qualification for the candidate.
2. Merge only reviewed changes.
3. Require `Build and publish images` to succeed for the exact `main` SHA.
4. Let `.github/workflows/deploy.yml` deploy that same SHA to the existing Compose staging server.
5. Verify `/opt/codistan/platform/.deployed-sha` and exact image identity.
6. Run migrations and health/readiness checks.
7. Verify PostgreSQL and game-content persistence.
8. Verify gateway/domain/SSL and private Admin access.
9. Run the automated staging certification.
10. Require `READY FOR UAT` before manual UAT.
11. Complete real Payment Service staging UAT when provider inputs exist.
12. Complete full developer/team manual UAT.
13. Fix defects through normal PRs, deploy the new exact SHA and recertify.

## Game portfolio boundary

The current exact-60 portfolio has already been published to the controlled local staging origin. Imported portfolio rewards/competitions remain disabled where intended and `productionActivation:false` is preserved.

Broader 140/300–500-title migration work is a future portfolio lane and does not block the current exact-60 staging launch unless scope changes.

## Historical compatibility references

The repository's permanent pre-staging checker retains several markers from the earlier staging-bootstrap era. They are kept here so repository governance remains stable; they are **not current AWS setup instructions**.

Historical mock-secret utility commands retained by the checker:

```bash
node scripts/generate-staging-application-secret.mjs
node scripts/validate-staging-application-secret.mjs
```

These utilities may still be useful for isolated/mock fixture generation, but the current deployed staging runtime uses protected server-side configuration as documented in `docs/STAGING-APPLICATION-SECRET.md`.

Historical portfolio wording retained for audit continuity:

- `61 submitted catalogue rows` described an earlier intake snapshot, not the current live staging count.
- `four oversized titles` refers to Duck Hunter, Ranger vs Zombies, Robotex and Swat vs Zombies; their local staging publication/qualification is already complete under #79.

The authoritative current launch scope is the exact-60 controlled local staging portfolio recorded under #48.

## Fail-closed controls

- no deployment if exact SHA/image identity is unprovable;
- no secret values in source control or evidence;
- no Premium grant from browser return state;
- no destructive database/game-content action in routine deploy;
- no production action from staging automation;
- no production approval without human UAT and explicit owner authorization.

Issue #48 is the current source of truth for staging and launch readiness.