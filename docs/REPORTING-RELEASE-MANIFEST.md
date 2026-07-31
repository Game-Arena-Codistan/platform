# Game Arena+ reporting release manifest

Candidate branch: `agent/game-arena-plus-reporting`

Candidate commit: `87798fc0580b12e872ef78805f33521f5d63d921`

Base commit: `766fb01bfec3a9948970945f2b8206e5855be1ea`

## Included

- Safe payment persistence and administration DTOs; hosted JazzCash checkout fields are transient and excluded from stored/admin transaction records.
- Immutable Game Arena+ plan snapshots and activation-versus-extension classification.
- Monetary member top-up discount issuance, redemption and reversal records.
- Authoritative summary, payment, paid-pass, recurring-customer, reconciliation and benefit-cost reports.
- Pakistan-local report presets and bounded custom ranges using UTC timestamps.
- Backend UTF-8 CSV exports, formula-injection protection, 10,000-row fail-closed limit and export audit hashes.
- Separate report-view, report-export, subscription adjustment, plan-management and reconciliation capabilities.
- Audited manual access grant, extension and revoke operations.
- Responsive operations-console reporting workspace and URL-backed filters.
- Indexed PostgreSQL reporting projections and deterministic staging fixtures.

## Explicitly not included

- Automatic recurring charging.
- JazzCash live merchant activation.
- Tax, accounting, ERP, warehouse or external BI integration.
- Full replacement of the legacy `platform_state` runtime or removal of its single-writer restriction; this remains #52.

## Qualification

The exact candidate commit must pass the complete local repository validation suite, clean PostgreSQL migrations, API/report tests, browser tests, container builds and OpenTofu validation before merge. After merge, AWS staging may use mock OTP and mock JazzCash. Live Game Arena+ remains gated by #17, #19 and the remaining #52 work.
