# Normalized PostgreSQL runtime migration

This runbook governs the removal of the legacy whole-platform JSON runtime and the transition to `normalized-postgres-v1`.

## Runtime model

The API persists one row per domain record in dedicated `ga_runtime_*` tables. Every row has:

- a stable record key;
- a monotonically increasing revision;
- a domain record payload;
- an update timestamp;
- a soft-deletion timestamp.

Domain-specific unique and query indexes enforce identity, session, payment-event, idempotency, voucher, tournament-entry, game-slug and reporting lookup rules. Finance/reporting projections remain typed in the `ga_*` reporting tables and are updated in the same transaction as their source runtime row.

The API refreshes committed rows before each locally serialized request. Separate API replicas use optimistic row revisions. Two replicas may safely commit unrelated records. Conflicting updates to the same record fail without acknowledgement and must be retried after refresh.

## Clean staging database

1. Apply all migrations through `apps/api/scripts/migrate.mjs`.
2. Verify `ga_runtime_schema_state` reports `normalized-postgres-v1`.
3. Start one API instance and verify catalogue seeds are inserted.
4. Start a second API instance and run the multi-writer integration test.
5. Run restart durability, payment/entitlement atomicity, report and load qualification.

## Existing legacy database

On the first start after migration:

1. The API detects an existing legacy snapshot only when the normalized runtime tables are empty.
2. It hydrates the compatibility model in memory once.
3. It writes every domain record into its dedicated row repository and typed reporting projection in one or more database transactions before serving traffic.
4. It copies the source snapshot and revision to `ga_legacy_state_archive`.
5. It drops the legacy runtime table.
6. It reloads the normalized repositories and exposes `persistenceModel=normalized-postgres-v1`.

Do not run old and new application images against the same database during this conversion.

## Verification

Run:

```bash
node scripts/check-postgres-staging-readiness.mjs
cd apps/api
npm test -- postgres-normalized-runtime.test.mjs
```

Database checks:

```sql
SELECT value FROM ga_runtime_schema_state WHERE id='persistence-model';
SELECT to_regclass('public.platform_state');
SELECT count(*) FROM ga_runtime_users WHERE deleted_at IS NULL;
SELECT count(*) FROM ga_runtime_transactions WHERE deleted_at IS NULL;
SELECT count(*) FROM ga_runtime_coin_ledger WHERE deleted_at IS NULL;
```

The legacy table lookup must return `NULL`.

## Rollback

Application rollback is allowed only to a build that understands `normalized-postgres-v1`. Do not roll back to an image that writes the legacy snapshot.

For a staging-only destructive reset:

1. stop all API replicas;
2. preserve a database snapshot;
3. truncate the `ga_runtime_*` domain tables and typed reporting projections;
4. restart the reviewed normalized build so catalogue defaults are seeded;
5. rerun qualification.

Restoring legacy behavior requires restoring the complete pre-migration database snapshot into an isolated environment. It is not an in-place production rollback.

## Completion evidence

Issue #52 can close only when:

- the legacy runtime table is absent;
- two API stores prove refresh and same-record conflict behavior;
- acknowledged payment, entitlement and ledger changes survive restart;
- duplicate provider events, rewards and idempotency keys are rejected by constraints;
- report queries use bounded indexed PostgreSQL sources;
- RDS TLS rejects an untrusted server;
- the complete API, container and staging qualification suite passes.
