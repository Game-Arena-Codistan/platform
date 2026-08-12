# Permanent staging certification

Issue #98 is the release-quality control issue. Issues #99, #100 and #101 own the player, Admin/Operations and API/orchestrator implementation tracks.

The permanent release sequence is:

`Code / PR → repository checks → immutable image publication → AWS staging deployment → deployment identity → automated staging certification → READY FOR UAT → human UAT → explicit production approval → promote exact artifacts → non-destructive production smoke`

A reachable staging URL is never sufficient evidence for UAT.

## Audited architecture

Game Arena is one private monorepo, not an order/branch-dispatch commerce platform.

- `apps/web` is the player PWA.
- `apps/api` is the modular-monolith API backed by normalized PostgreSQL.
- `apps/admin` is the private operations/reporting console.
- `apps/game-origin` is the isolated controlled game origin.
- `apps/game-ops` owns ingestion/certification tooling.
- `packages/game-bridge` is the versioned game integration contract.

There is no GraphQL order service, restaurant cart, delivery/takeaway workflow, branch Dispatcher role, Redis requirement or application websocket/subscription layer in the current source. Those scenarios are `NOT_APPLICABLE` unless the product later adds them.

## Staging origins

AWS staging is not provisioned yet, so there are no authoritative AWS staging URLs to record today. Once #48 provisions staging, the certification workflow resolves endpoints from SSM rather than hard-coding them:

- Customer Web: `https://<staging public-host>`
- API: `https://<staging public-host>/api`
- Game origin: `https://<staging game-host>`
- Admin: private `service/admin`, accessed by the GitHub runner through `kubectl port-forward`; it is not made Internet-public for Playwright.

The Vercel project remains a deterministic mock frontend and is not AWS staging evidence.

## Deployment identity gate

Gate zero runs before transactional tests. For `api`, `web`, `admin` and `games` it proves:

1. expected source SHA is a full commit reachable from `main`;
2. a successful `Build and publish images` workflow exists for that SHA;
3. the SHA-tagged ECR image resolves to an immutable digest;
4. the Kubernetes Deployment references the exact SHA-tagged ECR image;
5. every ready pod's `imageID` resolves to the same digest;
6. the image's `org.opencontainers.image.revision` label equals the expected SHA;
7. the previous healthy staging deployment marker is recorded when one exists.

Any mismatch or unprovable identity is `BLOCKED`. Browser/API tests do not run against an unproven release.

## Game Arena coverage

### Player and authentication

The deployed browser/API lanes cover public shell/catalogue, mock staging OTP request/invalid-code/verification, authenticated session, protected access, premium checkout entry, support, restart durability and mobile Chromium critical navigation. The desktop and mobile critical journey signs in through the real player modal, launches a deployed free game, verifies the iframe isolation boundary and then enters the fixed-duration Game Arena+ checkout.

### Premium and payments

Certification tests the current fixed-duration single-charge model. It proves membership checkout idempotency and proves that a browser return claiming `paid` cannot activate the authoritative payment or entitlement. Top-up checkout idempotency is exercised when offers exist. A deterministic protected QA voucher is tested when configured.

In `mock` JazzCash mode, a protected callback harness resolves only the existing staging webhook secret through the AWS OIDC session and Secrets Manager. It never logs or uploads the secret. It verifies:

- pending remains pending;
- amount mismatch is rejected and does not mutate the transaction;
- failed payment remains failed even after a later paid callback, with reconciliation handling;
- cancel/void remains voided;
- successful callback activates the matching entitlement;
- duplicate callback replay is idempotent;
- refund reverses the matching entitlement.

An external provider timeout is `NOT_APPLICABLE_IN_MOCK` because no provider network call occurs in mock mode.

When staging switches to hosted JazzCash, certification deliberately becomes `BLOCKED — PAYMENT SANDBOX NOT CONFIGURED` until #17 adds a provider-specific sandbox automation contract and safe staging credentials. A boolean flag alone cannot turn hosted payments green.

### Gameplay and rewards

The API lane starts a play session from the deployed catalogue, rejects an invalid nonce, accepts a valid proof according to the game's integrity policy, verifies duplicate completion idempotency and reads wallet/leaderboard state. It also proves a free player cannot start a premium game. Representative game, icon and banner URLs plus the controlled game-origin health endpoint are checked from staging.

When competitions are enabled, deterministic staging fixtures must exist for a free incomplete challenge, a premium challenge and a premium tournament. The suite proves incomplete/free and premium authorization failures without awarding rewards or entering a tournament. Multiplayer room coordination is exercised when a public multiplayer-capable game exists; otherwise that subcase is explicitly `NOT_APPLICABLE`.

### Admin and Operations

Production administration uses signed identity assertions with server-mapped roles: `admin`, `operator`, `support`, `security`, and `finance`. Certification requires staging identity mappings that cover all five roles and an unmapped negative identity. It tests both UI capability visibility and direct API enforcement. There is no branch Dispatcher matrix in the current product.

The certification runner obtains the existing `admin_proxy_secret` and `admin_identity_roles_json` from the protected runtime-control secret, masks them, generates short-lived signed assertions in `/tmp`, and never uploads those assertions.

### Runtime resilience

After the authenticated API journey, certification restarts only the staging API Deployment and proves the acknowledged session/payment state remains durable in PostgreSQL. Production smoke is GET-only and does not perform this mutation.

## Browser evidence safety

The permanent staging config uses:

- `retries: 0` for hard-blocker certification;
- `trace: off`;
- `video: off`;
- screenshots on failure;
- sanitized Playwright HTML/JSON summaries.

A critical test that passes only after retry is not considered certified.

## Visual approval

`tests/staging/visual-baselines.json` stores SHA-256 fingerprints of human-approved staging screenshots. The reviewed screenshots themselves are retained as the corresponding staging certification evidence rather than being silently regenerated.

Each certification run captures the current player home/library/premium/support surfaces and a deterministic Admin shell with dynamic report content masked. If an approved fingerprint is missing or changes, the visual lane produces `VISUAL_REVIEW_REQUIRED` and the overall machine decision is `BLOCKED` until a human reviews the captured screenshot and updates the baseline manifest through a normal pull request. Baselines are never auto-updated.

## Staging-only configuration

No passwords or provider secrets belong in issues, chat, Vercel or source control.

Existing protected `staging` environment/AWS configuration remains required. Certification additionally recognizes:

- variable `STAGING_QA_PLAYER_IDENTIFIER` — optional stable staging-only API QA identifier; when absent the runner uses a unique non-deliverable email in mock OTP mode;
- secret `STAGING_QA_VOUCHER_CODE` — optional deterministic staging-only voucher code when voucher regression is required.

The browser matrix always uses run/project-specific non-deliverable identifiers in mock OTP mode to avoid cross-project OTP throttling or user-state contamination.

The staging runtime-control secret must map at least one identity to each administrative role (`admin`, `operator`, `support`, `security`, `finance`). The workflow does not require or store human Admin passwords.

Hosted JazzCash certification remains blocked until #17 supplies the provider-specific sandbox/UAT automation contract; those credentials must be placed only in the protected AWS/GitHub secret boundary defined by that integration.

## Evidence

Each run writes sanitized evidence to the encrypted staging deployment-evidence bucket under:

`staging-certification/<SHA>/runs/<certification-run-id>.json`

and updates:

`staging-certification/<SHA>/latest.json`

The report includes the expected SHA, release/deployment/certification run IDs, component digests, running-image proof, test totals, safe failed-test summaries, QA correlation ID, visual-review count and one final decision. Payment callback details are written as sanitized status/correlation evidence only; signing material is never written to the evidence bundle.

The only final decisions are:

- `READY FOR UAT`
- `FAILED`
- `BLOCKED`

Known application/security/business failures take precedence as `FAILED`. Missing identity, environment, private Admin access, provider sandbox or approved visual baselines are `BLOCKED`.

## Human UAT and production

Human UAT starts only after `READY FOR UAT`. It remains an explicit business approval focused on UX, visual quality, copy/content, exploratory devices and acceptance.

Production promotion remains manual and protected. It requires:

1. the exact full SHA;
2. the latest staging certification marker for that SHA to say `READY FOR UAT`;
3. a non-sensitive human UAT approval reference;
4. the existing qualification/change references;
5. explicit `PROMOTE` confirmation and production Environment approval.

The production workflow promotes the same immutable SHA-tagged artifacts and then performs a non-destructive player/API/game-origin smoke check. It does not mutate live customer, payment, wallet, game or administrative state.

## Permanent feature rule

A feature is not complete with implementation alone. The affected work must add or update unit/API tests plus deployed browser, negative/error, authorization, Admin, payment, mobile and game-runtime certification where those concerns apply. A defect found in QA or UAT should become a permanent regression test before the fix is considered complete.
