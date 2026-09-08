# Production readiness boundary

## Current state

Game Arena is deployed on the existing self-managed/local-server staging environment and automated certification has reached `READY FOR UAT` for the current application/runtime lane.

The current launch path does **not** require AWS/EKS/S3 provisioning.

Issue #48 is the authoritative source for the exact staging-qualified SHA, deployment/certification evidence and final launch status.

## Repository/runtime scope already implemented

- player PWA;
- API/BFF;
- PostgreSQL persistence/migrations;
- private Admin/RBAC console;
- controlled local game origin and exact-60 staging portfolio;
- immutable image publication;
- Docker Compose staging deployment;
- restart/persistence/identity/browser/Admin/visual automated certification;
- external Payment Service integration code for Game Arena+.

## Current remaining gates

### 1. Real Payment Service staging UAT — #158/#165/#166

If paid Game Arena+ launch is in scope, install the real staging Payment Service configuration privately and prove:

- wallet linking;
- monthly/yearly plan flow;
- first trial/subscription without duplicate create;
- authoritative Premium entitlement;
- account/payment history;
- cancel/unlink;
- failed/past-due behavior where supported;
- webhook signature/idempotency/retry behavior;
- desktop/mobile;
- no secret leakage.

Mocks/unit/contract tests do not substitute for real provider staging evidence.

### 2. Human/manual UAT

The developer/team must complete and sign off the exact final staging SHA, including:

- frontend/account/authentication;
- all 60 deployed games;
- multiplayer;
- Premium/payment flows;
- Admin/RBAC;
- mobile/browser behavior;
- persistence/restart;
- security/regression.

Defects must be fixed, retested and followed by full critical regression. Any code change creates a new final SHA that must be deployed and automated-certified again.

### 3. Explicit production authorization

A staging/UAT PASS is not production authorization.

Production remains untouched until the project owner explicitly authorizes the exact approved staging release.

If real charging is part of production launch, #17 must also contain the relevant live provider/finance evidence for settlement, reconciliation, refunds/disputes, commercial limits and ownership.

## Production preparation requirements

Before explicit approval is requested, confirm:

- exact final SHA and immutable artifacts;
- staging automated certification and human UAT references;
- payment UAT reference when applicable;
- production domain/TLS configuration;
- production database/content backup and restore plan;
- previous known-good rollback target;
- private Admin access/roles;
- production provider configuration appropriate to launch scope;
- no unresolved critical/high issue.

## Historical/future infrastructure

AWS/OpenTofu/Kubernetes assets are retained as optional historical architecture only. #141 AWS/S3 source-vault archival is deferred/non-blocking.

Do not create AWS infrastructure for the current launch unless a new explicit architecture decision reactivates that lane.

See:

- `docs/DEPLOYMENT.md`
- `docs/DEPLOYMENT-HANDOFF.md`
- `docs/PAYMENT-SERVICE-INTEGRATION.md`
- `docs/QUALIFICATION.md`
- `docs/PRODUCTION-CUTOVER.md`
- `docs/GO-LIVE.md`