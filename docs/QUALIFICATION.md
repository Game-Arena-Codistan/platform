# Release qualification matrix

## Current qualification target

The active deployed qualification target is the self-managed/local-server Docker Compose staging environment recorded under issue #48.

AWS/Kubernetes/OpenTofu checks may remain in CI as supplemental repository validation, but they are not a launch prerequisite for the current staging/UAT path.

## Automated gates

| Area | Gate |
|---|---|
| Frontend | syntax/build, shell/runtime checks, catalogue references and browser journeys |
| API | route tests, OTP/session/CSRF, payment/BFF/webhook behavior, entitlement, rewards, account lifecycle and Admin authorization |
| PostgreSQL | migrations, durability, restart/concurrency and commit-safe behavior |
| Games | catalogue/manifest validation, scanner, immutable packaging, controlled-origin and runtime checks |
| Security | credential patterns, dependency/action pinning, browser auth/storage, sandbox/origin controls and secret-leak checks |
| Deployment identity | exact SHA, exact image tags/revisions, Compose services and `.deployed-sha` |
| Performance | API/business performance thresholds and retained non-sensitive evidence |
| Browser/Admin | player/mobile/Admin/RBAC/visual regression on deployed staging |

All mandatory current-lane checks must pass for the exact deployed SHA before the machine gate emits `READY FOR UAT`.

## Supported test matrix

### Browsers/devices

Automated staging covers the repository-supported browser matrix. Human UAT should additionally cover representative current Android/iPhone/desktop devices and any business-critical browser not fully automated.

Verify:

- responsive layout;
- PWA launch/update behavior;
- orientation where games require it;
- background/resume;
- keyboard/accessibility basics;
- touch controls and viewport safety.

### Network behavior

Where practical, test:

- broadband/Wi-Fi;
- normal mobile data;
- slow/interrupted network;
- temporary offline/online recovery;
- background/resume.

## Critical player journeys

1. Guest feed/search/catalogue/game details.
2. OTP request/invalid/resend/success/session/logout.
3. Free game launch/exit/retry.
4. Premium gate and plan catalogue.
5. Real external Payment Service wallet/subscription flow when provider staging is configured.
6. Premium entitlement persistence after authoritative status/webhook reconciliation.
7. Account subscription/payment history, cancel and unlink.
8. Arena Coin/reward idempotency where enabled.
9. Multiplayer create/rejoin where supported.
10. Game pause/rollout/kill-switch/rollback controls.
11. Account/support/Admin affected journeys.

## Payment qualification

Current Premium payment architecture:

`Browser → Game Arena API/BFF → external Payment Service → JazzCash → Payment Service webhook → Game Arena API/PostgreSQL → entitlement`

Repository mocks/contract tests may prove software behavior, but **real provider-backed staging UAT is required** before payment status can advance beyond `READY FOR STAGING UAT`.

Real payment UAT must cover:

- monthly/yearly plan catalogue;
- wallet link;
- first subscription/trial without duplicate create;
- entitlement activation;
- account/payment history;
- cancel/unlink;
- failed/past-due behavior where supported;
- duplicate/retry webhook behavior;
- desktop/mobile;
- secret/token/MPIN non-exposure.

Tracked under #158/#165/#166.

## Game qualification

The current exact-60 local staging portfolio is already controlled-origin deployed. Manual UAT should still verify all 60 titles for basic load/play/controls/layout/exit behavior.

Rewards and competitions remain disabled for imported titles where intended unless an approved integrity policy explicitly enables them.

## Acceptance thresholds

Do not advance if any of the following remains unresolved:

- critical/high security or data-integrity issue;
- sign-in/authentication blocker;
- API/database durability blocker;
- controlled game-origin/catalogue blocker;
- material Premium/payment/entitlement inconsistency;
- duplicate payment/reward side effect;
- Admin authorization leakage;
- critical browser/mobile journey failure;
- exact deployed SHA/image identity cannot be proven.

## Evidence record

For each manual test record:

- date/tester;
- exact build SHA;
- device/browser;
- journey/result;
- screenshots/video where safe;
- defect link;
- retest result.

Do not capture secrets, MPINs, API keys, tokens or private customer data.

Issue #48 consolidates current staging certification and human UAT evidence. #165/#166 own real payment staging UAT/certification. #17 remains relevant only for live provider/finance readiness when real charging is required for production.