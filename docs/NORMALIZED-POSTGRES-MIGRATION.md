# Normalized PostgreSQL runtime migration

This runbook governs removal of the legacy whole-platform JSON runtime and transition to `normalized-postgres-v1`.

## Runtime model

The API persists one row per domain record in dedicated `ga_runtime_*` tables. Every row has:

- a stable record key;
- a monotonically increasing revision;
- a domain record payload;
- an update timestamp;
- a soft-deletion timestamp.

Domain-specific unique and query indexes enforce identity, session, provider-event, idempotency, voucher, tournament-entry, game-slug and reporting lookup rules. Finance/reporting projections remain typed in the `ga_*` reporting tables and are updated in the same transaction as their source runtime row.

The API refreshes committed rows before each locally serialized request. Separate API replicas use optimistic row revisions. Replicas may safely commit unrelated records. Conflicting updates to the same record fail before acknowledgement and must be retried after refresh.

## Clean staging database

1. Apply every migration through `apps/api/scripts/migrate.mjs`.
2. Verify `ga_runtime_schema_state` reports `normalized-postgres-v1`.
3. Verify the legacy table lookup returns `NULL`.
4. Start one API instance and verify catalogue defaults are seeded.
5. Start a second API instance and run the multi-writer integration tests.
6. Run restart durability, payment/entitlement atomicity, report and load qualification.

## Existing legacy database

Migration `911_archive_legacy_platform_state.sql` performs the conversion inside the migration transaction before the new API starts:

1. Copy the legacy snapshot and revision to `ga_legacy_state_archive`.
2. Refuse conversion if normalized runtime rows already exist without a completed import marker.
3. Expand every legacy map and array into its dedicated `ga_runtime_*` repository table.
4. Preserve complete entitlement-history entries using a versioned record key.
5. Record `legacy-import-complete` in `ga_runtime_schema_state`.
6. Mark the protected archive as imported.
7. Drop the legacy runtime table.

If any step fails, the migration transaction rolls back. Do not run old and new application images against the same database during conversion. The normalized application contains no legacy data reader or writer.

## Verification

Run:

```bash
node scripts/check-postgres-staging-readiness.mjs
cd apps/api
npm test
```

The release-qualification workflow additionally starts PostgreSQL 16, applies clean migrations and runs restart plus multi-writer integration tests.

Database checks:

```sql
SELECT value FROM ga_runtime_schema_state WHERE id='persistence-model';
SELECT value FROM ga_runtime_schema_state WHERE id='legacy-import-complete';
SELECT to_regclass('public.platform_state');
SELECT count(*) FROM ga_runtime_users WHERE deleted_at IS NULL;
SELECT count(*) FROM ga_runtime_transactions WHERE deleted_at IS NULL;
SELECT count(*) FROM ga_runtime_coin_ledger WHERE deleted_at IS NULL;
SELECT id,source_revision,archived_at,imported_at FROM ga_legacy_state_archive;
```

The legacy table lookup must return `NULL`. The archive contains protected rollback evidence and is not a runtime source.

## Rollback

Application rollback is allowed only to a build that understands `normalized-postgres-v1`. Never roll back in place to an image that writes the legacy snapshot.

For a staging-only destructive reset:

1. stop all API replicas;
2. preserve a database snapshot;
3. truncate the `ga_runtime_*` domain tables and typed reporting projections;
4. retain `ga_runtime_schema_state` and the protected legacy archive;
5. restart the reviewed normalized build so catalogue defaults are seeded;
6. rerun qualification.

Restoring legacy behavior requires restoring the complete pre-migration database snapshot into an isolated environment. It is not an in-place production rollback.

## Completion evidence

Issue #52 can close only when:

- the legacy runtime table is absent;
- two API stores prove unrelated writes and same-record conflict behavior;
- acknowledged payment, entitlement and ledger changes survive restart;
- duplicate provider events, rewards and idempotency keys are rejected by constraints;
- report queries use bounded indexed PostgreSQL sources;
- RDS TLS rejects an untrusted server;
- the complete API, container, security and qualification suite passes.
