# Backend architecture

The platform API is a dependency-light Node.js modular monolith with explicit modules for catalogue/game operations, OTP delivery, sessions/devices, Premium billing/BFF integration, entitlements, rewards, competitions, operations, audit and reporting.

## Runtime stores

- Tests and isolated development may use deterministic in-memory fixtures where appropriate.
- Deployed staging uses PostgreSQL as the durable runtime source of truth.
- Migrations and repository tests cover the normalized operational/reporting data model and commit-safe persistence behavior.
- Staging certification includes restart durability and database-backed business journeys.

Do not introduce a new persistence model or destructive migration solely for deployment convenience.

## Data model

The PostgreSQL model covers users/identities, OTP/session/device state, games/versions, payment/subscription/event state, entitlements, ledgers, play sessions/scores, competitions, reconciliation/reporting and audit/operational records.

Run migrations with the repository migration command against the target environment only after reviewing the migration and backup/rollback boundary.

## Provider boundaries

### OTP

OTP delivery is server-side and may use configured provider adapters or staging mocks where explicitly allowed.

### Game Arena+ payments

Current Premium subscription architecture is:

`Browser → Game Arena API/BFF → external Payment Service → JazzCash → Payment Service webhook → Game Arena API/PostgreSQL → entitlement`

The backend:

- derives `userId` from the authenticated session;
- keeps the Payment Service API key/webhook secret server-only;
- requests plan/catalogue/status data through the server-side client;
- verifies signed Payment Service webhooks on raw bytes;
- deduplicates/retries provider events safely;
- reconciles authoritative provider status before entitlement changes.

Legacy direct JazzCash adapters/settings may remain for unrelated non-subscription compatibility. They are not the current Game Arena+ subscription boundary.

## Trust rules

- The browser never grants Premium or changes coins.
- Browser redirects are not payment authority.
- HTML5 games request rewards; server play/session/version/nonce/policy checks decide state changes.
- OTP codes are short-lived/rate-limited and session security remains server-enforced.
- Browser sessions use opaque HttpOnly cookies, CSRF and allowed-origin checks.
- Administrative mutations are capability/role-restricted and audited.
- Provider secrets never belong in browser-visible config.

## Deployment boundary

The active staging backend runs in the self-managed/local-server Docker Compose stack defined by `infra/docker-compose.staging.yml` and deployed by `.github/workflows/deploy.yml`.

AWS/EKS/RDS-specific runtime instructions are historical/optional and are not required for the current launch.

## Scaling rule

Scale only after measuring the actual runtime bottleneck and proving database/provider/idempotency behavior under the intended concurrency. Do not introduce microservices, queues, Redis or cloud-managed infrastructure merely because historical architecture documents mention them.