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

## Indexed reporting model

Deployed administration and finance report routes use `PostgresSubscriptionReportService` and the typed PostgreSQL projections:

- `ga_plan_versions`;
- `ga_payment_attempts` and `ga_payment_events`;
- `ga_subscription_periods`;
- `ga_reconciliation_cases`;
- `ga_benefit_ledger`;
- `ga_report_export_audit` and `ga_audit_events`.

Queries require bounded dates, use indexed filter columns and stop with narrowing instructions above 10,000 selected rows. They do not deserialize the full runtime repository. Local/mock fixtures retain the in-memory calculation layer so contract tests remain deterministic.

Migration `912_backfill_reporting_projections.sql` makes normalized or legacy-converted runtime records immediately reportable. Its timestamp parser accepts both ISO timestamps and historical epoch-millisecond values. The migration is idempotent and can be rerun safely during qualification.

## Clean staging database

1. Apply every migration through `apps/api/scripts/migrate.mjs`.
2. Verify `ga_runtime_schema_state` reports `normalized-postgres-v1`.
3. Verify the legacy table lookup returns `NULL`.
4. Start one API instance and verify catalogue defaults are seeded.
5. Start a second API instance and run the multi-writer integration tests.
6. Run restart durability, payment/entitlement atomicity, indexed-report and load qualification.
7. Verify report responses include `dataSource: postgresql-indexed` or the matching response header.

## Existing legacy database

Migration `911_archive_legacy_platform_state.sql` performs the conversion inside the migration transaction before the new API starts:

1. Copy the legacy snapshot and revision to `ga_legacy_state_archive`.
2. Refuse conversion if normalized runtime rows already exist without a completed import marker.
3. Expand every legacy map and array into its dedicated `ga_runtime_*` repository table.
4. Preserve complete entitlement-history entries using a versioned record key.
5. Record `legacy-import-complete` in `ga_runtime_schema_state`.
6. Mark the protected archive as imported.
7. Drop the legacy runtime table.
8. Run migration 912 to populate the typed reporting projections.

If any step fails, the migration transaction rolls back. Do not run old and new application images against the same database during conversion. The normalized application contains no legacy data reader or writer.

## Verification

Run:

```bash
node scripts/check-postgres-staging-readiness.mjs
node scripts/check-indexed-postgres-reports.mjs
cd apps/api
npm test
```

The release-qualification workflow additionally starts PostgreSQL 16, applies clean migrations and runs restart, multi-writer, projection-backfill, report, export and audit integration tests serially.

Database checks:

```sql
SELECT value FROM ga_runtime_schema_state WHERE id='persistence-model';
SELECT value FROM ga_runtime_schema_state WHERE id='legacy-import-complete';
SELECT to_regclass('public.platform_state');
SELECT count(*) FROM ga_runtime_users WHERE deleted_at IS NULL;
SELECT count(*) FROM ga_runtime_transactions WHERE deleted_at IS NULL;
SELECT count(*) FROM ga_runtime_coin_ledger WHERE deleted_at IS NULL;
SELECT count(*) FROM ga_payment_attempts;
SELECT count(*) FROM ga_subscription_periods;
SELECT count(*) FROM ga_report_export_audit;
SELECT id,source_revision,archived_at,imported_at FROM ga_legacy_state_archive;
```

The legacy table lookup must return `NULL`. The archive contains protected rollback evidence and is not a runtime source. Runtime and projection counts should reconcile for the selected domain and filters; soft-deleted runtime rows are excluded.

## Rollback

Application rollback is allowed only to a build that understands `normalized-postgres-v1` and indexed reporting. Never roll back in place to an image that writes the legacy snapshot or reads the complete platform into memory for deployed reports.

For a staging-only destructive reset:

1. stop all API replicas;
2. preserve a database snapshot;
3. truncate the `ga_runtime_*` domain tables and typed reporting projections;
4. retain `ga_runtime_schema_state` and the protected legacy archive;
5. restart the reviewed normalized build so catalogue defaults are seeded;
6. rerun migrations 911 and 912 as applicable;
7. rerun qualification.

Restoring legacy behavior requires restoring the complete pre-migration database snapshot into an isolated environment. It is not an in-place production rollback.

## Completion evidence

Issue #52 can close only when:

- the legacy runtime table is absent;
- two API stores prove unrelated writes and same-record conflict behavior;
- acknowledged payment, entitlement and ledger changes survive restart;
- duplicate provider events, rewards and idempotency keys are rejected by constraints;
- report queries use bounded indexed PostgreSQL sources;
- legacy epoch timestamps backfill into typed report projections;
- report totals, ledgers, identity masking, CSV output and export audit pass against PostgreSQL 16;
- RDS TLS rejects an untrusted server;
- the complete API, container, security and qualification suite passes.
