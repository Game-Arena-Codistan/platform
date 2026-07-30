# Backend architecture

The platform API is a dependency-light Node.js service with explicit modules for catalogue administration, OTP delivery, sessions/devices, JazzCash transactions, premium entitlements, rewards, competitions, operations, audit and metrics.

## Runtime stores

- Tests and isolated development use `MemoryStore`.
- Production requires `DATABASE_URL` and uses `PostgresStore`.
- The current PostgreSQL adapter persists the synchronous service repository as an atomic versioned JSONB snapshot while the normalized migrations define the reporting and future transactional target.
- To prevent lost updates, the current production deployment intentionally runs **one API writer replica** with advisory locking and revision checks. Do not horizontally scale API writers until the repository is migrated fully to normalized transactional tables or another concurrency-safe store.

This boundary is explicit in Kubernetes (`replicas: 1`, `Recreate`) and deployment documentation.

## Data model

Migrations cover users/identities, OTP challenges, sessions/devices, games/versions/reports, transactions/events/reconciliation, entitlements, play sessions/scores, Arena Coin ledger, challenges, tournaments, adjustments, audit events and durable operational state.

Run migrations with:

```bash
cd apps/api
DATABASE_URL=postgres://... npm run migrate
```

## Provider boundaries

- OTP delivery supports primary/secondary HTTP providers, circuit behavior and mock/disabled modes.
- JazzCash supports mock, disabled and hosted-checkout modes. Request fields are signed and provider events are verified/idempotent.
- Production credentials are environment/secret-manager values, never repository content.

## Trust rules

- The browser never grants premium or changes coins.
- HTML5 games request rewards; server play sessions, version/nonce/plausibility/rate checks decide them.
- Coin changes are append-only and idempotent; high-value support adjustments require a second administrator.
- OTP codes are hashed, single-use, short-lived and limited by identity, IP and device.
- Browser sessions use opaque HttpOnly cookies, rotation, CSRF and approved-origin checks.
- Payment returns are untrusted; verified provider events drive the transaction and entitlement state machines.
- Administrative mutations are role-restricted and audited.

## Scaling path

1. Keep API writes on one replica for the initial controlled launch.
2. Move high-volume entities from the snapshot repository to normalized PostgreSQL repositories with transactions and row-level concurrency.
3. Add an outbox/worker for provider delivery, callbacks, reconciliation and analytics aggregation.
4. Add Redis only for measured shared rate-limit/cache needs.
5. Scale stateless API replicas after concurrency and failure tests prove correctness.
