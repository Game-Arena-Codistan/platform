# Deployment and integration handoff

## Current target

The active Game Arena handoff target is the existing **self-managed/local-server Docker Compose staging environment**, not AWS.

- Repository: `https://github.com/Game-Arena-Codistan/platform`
- Staging: `https://gsmarena-play.codistan.org`
- Active deployment workflow: `.github/workflows/deploy.yml`
- Active staging stack: `infra/docker-compose.staging.yml`
- Current release source of truth: issue #48

Do not create AWS accounts, IAM roles, S3 buckets, EKS clusters or AWS staging environments for the current launch. Historical AWS/OpenTofu/Kubernetes files may remain in the repository for future reference only.

## What is already complete

The current staging platform has already been built, deployed and automated-certified for UAT, including:

- player frontend and account flows;
- modular-monolith API backed by PostgreSQL;
- private Admin/RBAC surface;
- controlled game origin and exact-60 portfolio;
- persistent database and game-content storage;
- restart recovery;
- SSL/domain/gateway operation;
- multiplayer regression coverage;
- automated browser/API/Admin/visual certification;
- external Payment Service integration code and server-side BFF/webhook boundary.

If code changes during takeover, use the normal PR/CI/release path and recertify the exact new SHA. Do not rely on evidence from an older deployed SHA after changing runtime code.

## Immediate developer priorities

1. Review issue #48 and this handoff before changing anything.
2. Confirm the current staging site and core flows still behave normally.
3. Configure the **real staging external Payment Service** once the provider values are supplied privately.
4. Run real payment staging UAT under #165/#166.
5. Complete full manual UAT across player/API/Admin/60 games/multiplayer/mobile/security/persistence.
6. Fix any defects through normal PRs and rerun automated certification.
7. Record the final exact SHA, UAT result and demo/evidence.
8. Stop at `READY FOR PRODUCTION APPROVAL` until the project owner explicitly authorizes production.

## Payment architecture

The current Game Arena+ subscription path is:

`Browser → Game Arena API/BFF → external Payment Service → JazzCash → Payment Service webhook → Game Arena API/PostgreSQL → entitlement`

Game Arena must not expose the Payment Service product API key or webhook secret to the browser.

Required runtime values on the **API/server only**:

```text
PAYMENT_SERVICE_MODE=external
PAYMENT_SERVICE_URL=...
PAYMENT_SERVICE_API_KEY=...
PAYMENT_SERVICE_WEBHOOK_SECRET=...
PAYMENT_SERVICE_APP_RETURN_URL=https://gsmarena-play.codistan.org/#/premium
PAYMENT_SERVICE_TIMEOUT_MS=8000
```

The Payment Service product catalogue is authoritative for monthly/yearly plan codes and prices. The browser must never submit an arbitrary amount.

Expected webhook target:

`https://gsmarena-play.codistan.org/api/v1/webhooks/payments`

Do not paste secrets into GitHub issues, chat, screenshots or the demo video.

See `docs/PAYMENT-SERVICE-INTEGRATION.md`.

## Real payment staging UAT

Prove at minimum:

- sign in;
- monthly plan selection;
- MSISDN + consent;
- wallet linking on the provider-hosted/JazzCash flow;
- first trial/subscription recognized without duplicate subscription creation;
- authoritative Premium entitlement activation;
- payment/account history;
- cancel behavior;
- unlink behavior;
- failed/past-due behavior where staging supports it;
- duplicate/retried webhook idempotency;
- yearly plan;
- desktop/mobile;
- no secret leakage.

Record a short stakeholder demo only after the real staging flow is working. Do not record MPINs, keys, tokens or protected configuration.

## Manual platform UAT

The developer/team must also verify:

- OTP/login/logout/session behavior;
- navigation, catalogue, favourites and account;
- all 60 deployed games;
- game loading, orientation, audio, pause/resume and exit where supported;
- multiplayer create/rejoin;
- free/premium gating;
- Admin role boundaries and affected reports/operations;
- mobile/responsive supported browsers;
- PostgreSQL persistence;
- game-content persistence;
- container/service restart recovery;
- SSL/domain/gateway;
- security/regression behavior.

Use the UAT handover/checklist and link every material defect to its retest evidence.

## Production boundary

This handoff does **not** authorize production.

Production can be considered only after:

- real payment staging UAT passes if paid charging is required at launch;
- full human/manual UAT passes;
- all critical/high defects are closed and retested;
- the exact final staging SHA is recertified;
- the project owner gives explicit production authorization.

Then follow `docs/PRODUCTION-CUTOVER.md` and `docs/GO-LIVE.md` using the exact staging-approved application artifacts.

## Non-blocking historical work

- #141 AWS/S3 source-vault archival is deferred/not planned for the current local-server launch.
- #79 is complete for the local staging oversized-game scope.
- AWS/EKS/S3 provisioning is not a current launch dependency.

The only active launch blockers should be payment UAT, human UAT and explicit production approval, plus #17 provider/finance evidence if real production charging is in scope.