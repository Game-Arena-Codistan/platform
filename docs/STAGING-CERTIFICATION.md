# Permanent staging certification

## Release sequence

The current release-quality sequence is:

`Code / PR → repository checks → immutable image publication → self-managed Docker Compose staging deployment → deployment identity → automated certification → READY FOR UAT → human UAT → explicit production approval → production cutover/smoke`

A reachable staging URL is never sufficient evidence for UAT.

## Current staging architecture

The active staging lane is the existing self-managed/local-server Docker Compose deployment.

- `apps/web` — player PWA;
- `apps/api` — modular-monolith API/BFF backed by PostgreSQL;
- `apps/admin` — private operations/reporting console;
- `apps/game-origin` — controlled game origin;
- `infra/docker-compose.staging.yml` — active staging stack;
- `.github/workflows/release.yml` — immutable image publication;
- `.github/workflows/deploy.yml` — exact-SHA staging deployment and certification trigger;
- `.github/workflows/aws-staging-certification.yml` — historical filename retained; currently certifies the Compose staging host.

AWS/EKS/S3 provisioning is not part of this current certification lane.

## Deployment identity gate

Before business/browser tests, certification must prove the exact release identity for the application services:

1. candidate is a full Git SHA from the approved source branch/history;
2. immutable image publication succeeded for that SHA;
3. deployment synchronized the expected staging Compose/gateway files;
4. server `.deployed-sha` matches the candidate;
5. Compose resolves application images to the exact SHA tag, never `latest`;
6. expected containers are running that exact revision;
7. non-sensitive image identity/digest evidence is captured.

Any unprovable mismatch is `BLOCKED`.

## Runtime gates

Certification covers:

- API/readiness and PostgreSQL-backed business flows;
- catalogue/game-origin reachability;
- authentication/session/CSRF behavior;
- Premium/payment software safety;
- top-up/voucher behavior where configured;
- play proof/reward idempotency;
- multiplayer where supported;
- restart durability/persistence;
- private Admin signed-role authorization;
- player/mobile/browser journeys;
- visual baseline checks;
- performance thresholds and non-sensitive evidence.

## Premium/payment certification

The current Game Arena+ architecture is:

`Browser → Game Arena API/BFF → external Payment Service → JazzCash → Payment Service webhook → Game Arena API/PostgreSQL → entitlement`

Two distinct evidence levels exist:

### Repository/software certification

Automated tests may validate:

- BFF route/auth/identity boundaries;
- server-only Payment Service credentials;
- plan-code/amount authority rules;
- wallet/subscription response handling;
- webhook signature/event validation;
- idempotency/retry behavior;
- authoritative entitlement mapping;
- browser return not granting Premium;
- disabled/fallback behavior when provider credentials are absent.

This can support `READY FOR STAGING UAT` but cannot claim real provider success.

### Real provider staging UAT

Tracked under #165/#166 and required to advance beyond `READY FOR STAGING UAT` when payments are launch scope.

It must prove the actual deployed path for monthly/yearly wallet linking, first subscription/trial, authoritative Premium activation, payment/account history, cancel/unlink, failure/past-due where supported, webhook retry/idempotency, desktop/mobile and secret non-exposure.

Do not substitute mock/direct JazzCash callback tests for real external Payment Service UAT.

## Admin certification

Admin remains private and must be tested through the server-enforced signed identity/role boundary. Required role/capability coverage must pass without exposing signing material.

## Game certification

The current exact-60 portfolio is deployed to the controlled local staging origin. Automated certification verifies catalogue/origin/runtime safety; manual UAT still checks all 60 titles for actual user-facing load/play/control/layout behavior.

Rewards and competitions remain disabled for imported titles where intended unless explicitly approved.

## Final machine decisions

The automated current-lane gate may emit only evidence-supported states such as:

- `READY FOR UAT` — current application/runtime automated certification passed;
- `FAILED` — required current-lane test failed;
- `BLOCKED` — required environment/evidence prerequisite could not be proven.

Payment issue #166 separately uses payment-readiness states and must not call real provider UAT passed without actual provider evidence.

## Human UAT boundary

Human UAT begins only after automated `READY FOR UAT` for the exact deployed SHA.

If UAT causes any runtime code/configuration change that affects the release candidate, deploy/certify the new exact SHA and attach evidence to that SHA. Do not reuse an older certification marker.

## Evidence

Issue #48 is the authoritative current staging/launch gate. Record only non-sensitive run IDs, artifact IDs/digests, pass/fail counts, exact SHA and UAT references.

Production remains untouched until human UAT is accepted and explicit production authorization is separately provided.