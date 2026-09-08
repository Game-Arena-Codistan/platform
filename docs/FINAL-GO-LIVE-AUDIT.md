# Final staging and go-live audit

## Supersession notice

The original July 2026 audit in this file described an early AWS/EKS target and several implementation gaps that were subsequently fixed. That historical assessment is no longer the current launch state.

This file now records the current launch boundary. Issue #48 remains the authoritative source for the exact deployed SHA and latest evidence.

## Current executive conclusion

Game Arena is already deployed to the existing **self-managed/local-server Docker Compose staging environment** and automated certification has reached `READY FOR UAT` for the application/runtime lane.

AWS/EKS/S3 provisioning is **not required** for the current staging/UAT/production-approval path.

Repository/runtime work completed since the historical audit includes:

- signed-role Admin authorization and private Admin certification;
- normalized PostgreSQL persistence/runtime work and durability testing;
- payment/entitlement invariants and reporting/admin work;
- safe game ingestion and controlled local game origin;
- exact-60 game publication/certification;
- multiplayer metadata regression repair;
- immutable image identity/deployment evidence;
- deployed API/business/performance/restart/browser/Admin/visual certification;
- external Payment Service BFF/webhook/subscription integration for Game Arena+.

## Current staging architecture

`GitHub main → immutable release images → self-managed Docker Compose staging → gateway/domain/SSL → automated certification → human UAT`

Runtime components:

- PostgreSQL;
- migration runner;
- API/BFF;
- player web;
- private Admin;
- controlled game origin;
- gateway/reverse proxy;
- persistent host game-content storage.

The exact deployed release and certification run/artifact are maintained under #48.

## Current payment architecture

Game Arena+ now uses:

`Browser → Game Arena API/BFF → external Payment Service → JazzCash → Payment Service webhook → Game Arena API/PostgreSQL → entitlement`

The Payment Service API key and webhook secret remain server-only. Browser return state is never entitlement authority.

Repository implementation is complete. Real provider-backed staging UAT still requires the external Payment Service staging endpoint/credentials/product configuration and supported JazzCash sandbox/test wallet flow.

Tracked under #158/#165/#166.

## Current readiness by area

| Area | Current status | Remaining action |
|---|---|---|
| Player frontend | Automated-certified | Human UAT and defect retest |
| API/backend | Automated-certified | Human/regression UAT; fix only discovered defects |
| PostgreSQL/persistence | Deployed and restart-tested | Manual UAT/backup confirmation |
| Admin/RBAC | Automated-certified | Manual Admin UAT |
| Exact-60 games | Deployed/qualified | Manual all-60 gameplay UAT |
| Multiplayer | Regression fixed/certified | Manual supported multiplayer UAT |
| Game Arena+ code | Implemented/deployed | Real Payment Service staging UAT |
| Payment provider | Ready for staging UAT | Install real staging config and execute #165 |
| Local deployment | Healthy/certified | No infrastructure rebuild required |
| AWS/EKS/S3 | Deferred/optional | Not a current launch blocker |
| Production | Not authorized | Human UAT + payment UAT + explicit approval |

## Remaining blockers before production approval

### 1. Real Payment Service/JazzCash staging UAT

If paid launch is required, prove the real staging chain including monthly/yearly, wallet link, first subscription/trial, authoritative entitlement, payment history, cancel/unlink, failure/past-due where supported, webhook retry/idempotency, desktop/mobile and secret non-exposure.

### 2. Human/manual UAT

Complete the developer/team handover UAT across frontend, backend/API, Admin, all 60 games, multiplayer, mobile/browser, persistence/restart and security/regression.

Every material defect must be fixed and retested. Code changes require deployment/certification of the new exact SHA.

### 3. Explicit production authorization

Production remains untouched until the project owner explicitly approves the exact final staging-qualified SHA after UAT evidence is accepted.

If real charging is part of production launch, #17 also remains the provider/finance evidence gate for live merchant/provider readiness, settlement/reconciliation/refunds/disputes and ownership.

## Historical AWS work

Historical AWS/OpenTofu/Kubernetes workflows remain in the repository for optional future use only.

- #141 AWS source-vault archival: deferred/non-blocking.
- #79 local oversized-game staging scope: complete.
- AWS account/OIDC/EKS/RDS/S3 setup must not be requested for the current launch.

A future AWS migration requires a separate explicit architecture decision and fresh audit.

## Go-live rule

Only advance to `READY FOR PRODUCTION APPROVAL` when:

- real payment staging UAT has passed when payments are launch scope;
- full human/manual UAT has passed;
- no unresolved critical/high defect remains;
- exact final SHA and automated deployment/certification evidence are recorded;
- demo/evidence pack is available where required.

Then wait for explicit owner production authorization and follow `docs/PRODUCTION-CUTOVER.md` / `docs/GO-LIVE.md`.

This audit itself never authorizes production.