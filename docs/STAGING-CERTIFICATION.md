# Permanent staging certification

Issue #98 is the release-quality control issue. Issues #99, #100 and #101 own the player, Admin/Operations and API/orchestrator implementation tracks.

The permanent release sequence is:

`Code / PR → repository checks → immutable image publication → EC2 Compose staging deployment → deployment identity → automated certification → READY FOR UAT → human UAT → production promotion authorization → explicit cutover → non-destructive production smoke`

A reachable staging URL is never sufficient evidence for UAT.

## Current staging architecture

The current development/staging lane is the lightweight Docker Compose deployment operated on the staging EC2 host. It is intentionally simpler than the later managed EKS/RDS architecture in `docs/AWS-DEPLOYMENT.md`.

- `apps/web` — player PWA.
- `apps/api` — modular-monolith API backed by PostgreSQL.
- `apps/admin` — private operations/reporting console.
- `apps/game-origin` — isolated controlled game origin.
- `infra/docker-compose.staging.yml` — exact-SHA EC2 staging stack.
- `.github/workflows/deploy.yml` — deploys the exact release SHA after immutable image publication and then invokes certification.
- `.github/workflows/aws-staging-certification.yml` — file name retained for continuity; implementation now certifies the EC2 Compose staging host.

The public Vercel project remains a deterministic mock preview and is not staging evidence.

## Deployment identity gate

Gate zero runs before transactional tests. For `api`, `web`, `admin` and `game-origin` it proves:

1. the candidate is a full Git SHA reachable from `main`;
2. a successful `Build and publish images` workflow exists for that SHA;
3. the deployment workflow synced `infra/docker-compose.staging.yml` and gateway configuration from that same SHA;
4. the staging server recorded that SHA in `/opt/codistan/platform/.deployed-sha`;
5. Docker Compose resolves every Game Arena application image to the exact SHA tag, never `latest`;
6. each expected container is running the exact SHA-tagged image;
7. the running image's `org.opencontainers.image.revision` label equals the expected SHA;
8. a registry digest/image ID is captured as non-sensitive evidence.

Any mismatch or unprovable identity is `BLOCKED`. Browser/API tests do not certify an unproven release.

## Staging deployment behavior

`release.yml` publishes immutable GHCR images. `deploy.yml` waits for that successful publication, checks out the same SHA, synchronizes only the reviewed deployment files to `/opt/codistan/platform`, authenticates the server to GHCR with the job-scoped GitHub token, pulls exact-SHA images and runs Compose without using the mutable `latest` tag.

The server keeps its protected `infra/.env`; the workflow never copies secrets from source control. Deployment verifies gateway, API, private Admin and game-origin health before certification begins.

The current first-shakeout runtime may use mock OTP and mock JazzCash. That allows synthetic QA identities while the PM-provided free/premium test accounts are pending.

## Game Arena coverage

### Player and authentication

Desktop and mobile Chromium cover the public shell, home/feed/library routes, OTP negative and positive verification, session persistence/logout, catalogue search/favourites, free game launch, iframe isolation, support, responsive safety, PWA files and the fixed-duration Game Arena+ checkout journey.

Synthetic run-specific identities are used when protected PM accounts are absent. `READY FOR UAT` additionally requires both protected free and premium QA-account checks to pass.

### Premium and payments

Certification tests the fixed-duration single-charge model. It covers checkout creation/idempotency, browser-return safety, top-ups/vouchers when configured, premium authorization and the mock JazzCash callback matrix:

- pending remains pending;
- amount mismatch is rejected;
- failed cannot silently become paid;
- void/cancel stays voided;
- success activates the matching entitlement;
- duplicate callbacks are idempotent;
- refund reverses the matching entitlement.

The callback secret is supplied only through the protected staging Environment as `STAGING_JAZZCASH_WEBHOOK_SECRET` and is never written to artifacts. Hosted JazzCash remains `BLOCKED — PAYMENT SANDBOX NOT CONFIGURED` until #17 provides the real sandbox contract and credentials.

### Gameplay, rewards and competitions

The suite verifies catalogue/media reachability, controlled game-origin health, free/premium authorization, play proof/replay safety, wallet/leaderboard behavior, challenges/tournaments when enabled, multiplayer room coordination where supported and the controlled game iframe boundary.

### Admin and Operations

Admin remains private on the staging host and is reached by the certification runner through an SSH local tunnel to `127.0.0.1:8083`.

For the initial shakeout, `STAGING_QA_ADMIN_KEY` may exercise the full local staging Admin console. That is useful for reports, plans, payments, subscriptions, users, games, reviews, audit and export regression, but it is **not enough for `READY FOR UAT`**.

The final machine gate requires signed staging assertions for `admin`, `operator`, `support`, `security` and `finance`, generated from protected `STAGING_ADMIN_PROXY_SECRET` and `STAGING_ADMIN_IDENTITY_ROLES_JSON`. Missing role coverage is reported as `SIGNED_ADMIN_ROLE_MATRIX_PENDING`.

### Runtime resilience

After the authenticated API journey, certification restarts only the staging API container through Compose and proves acknowledged session/payment state remains durable in PostgreSQL.

## Browser evidence safety

The staging browser config uses:

- `retries: 0` for release blockers;
- `trace: off`;
- `video: off`;
- screenshots on failure;
- sanitized Playwright JSON/HTML evidence.

A critical test that only succeeds after retry is not certified.

## Visual approval

`tests/staging/visual-baselines.json` stores SHA-256 fingerprints of human-approved staging screenshots. The first live run intentionally produces `VISUAL_REVIEW_REQUIRED`. A human reviews the captures and updates fingerprints through a normal PR. Baselines are never auto-approved or auto-updated.

## Protected staging configuration

Do not place values from this section in issues, chat, Vercel or source control.

### GitHub `staging` Environment

Infrastructure/deployment:

- secret `DEPLOY_HOST`
- secret `DEPLOY_USER`
- secret `DEPLOY_SSH_KEY`
- secret `DEPLOY_SSH_KNOWN_HOSTS`
- variable `STAGING_PLAYER_URL`
- variable `STAGING_API_URL` (optional when it is `<player>/api`)
- variable `STAGING_GAME_URL`

Certification/runtime:

- secret `STAGING_JAZZCASH_WEBHOOK_SECRET`
- secret `STAGING_QA_ADMIN_KEY` for the temporary local-admin shakeout
- secret `STAGING_ADMIN_PROXY_SECRET` and `STAGING_ADMIN_IDENTITY_ROLES_JSON` for final signed-role certification
- variable `STAGING_QA_PLAYER_IDENTIFIER` for generic API QA when desired
- secret `STAGING_QA_VOUCHER_CODE` when voucher regression is required

PM-provided account boundary:

- variable `STAGING_QA_FREE_PLAYER_IDENTIFIER`
- secret `STAGING_QA_FREE_PLAYER_OTP_CODE` when debug OTP is unavailable
- variable `STAGING_QA_PREMIUM_PLAYER_IDENTIFIER`
- secret `STAGING_QA_PREMIUM_PLAYER_OTP_CODE` when debug OTP is unavailable

The test files work without those PM accounts by using synthetic identities in mock OTP mode, but the aggregate gate remains `BLOCKED — PM_QA_ACCOUNTS_PENDING` until both protected account checks pass.

### Staging server `infra/.env`

The deploy workflow preserves this server-side file. At minimum it must contain non-production values for the required Compose inputs such as `POSTGRES_PASSWORD`, `PUBLIC_ORIGIN`, `ALLOWED_ORIGINS`, `GAME_ARENA_GAME_ORIGIN`, `GAME_ARENA_GAME_HOSTS` and `JAZZCASH_WEBHOOK_SECRET`, plus the chosen Admin authentication configuration. Values are never committed.

## Evidence and decisions

Every certification run uploads sanitized GitHub Actions evidence containing the expected SHA, release/deployment/certification run IDs, running-image identity, functional results, browser totals, safe failure summaries, QA correlation ID and visual-review status.

The only final decisions are:

- `READY FOR UAT`
- `FAILED`
- `BLOCKED`

Known application/security/business defects are `FAILED`. Missing environment identity, signed Admin role matrix, PM QA accounts, mock-payment secret/provider sandbox or approved visual baseline are `BLOCKED`.

## Human UAT and production

Human UAT starts only after `READY FOR UAT` and focuses on UX, visual quality, copy/content, exploratory device behavior and business acceptance.

`.github/workflows/promote-production.yml` is a manual **authorization gate only**. It requires:

1. the exact full SHA;
2. a successful `deploy.yml` run for that exact SHA (which includes successful staging certification);
3. a non-sensitive human UAT approval reference;
4. explicit `PROMOTE` confirmation;
5. the protected `production` GitHub Environment boundary.

The authorization workflow deliberately performs no production deployment. Actual cutover remains a later explicit action after the owner approves it and production runtime/provider configuration is ready. The existing production environment must remain available as rollback until the replacement passes production smoke and an observation period.

## Permanent feature rule

A feature is not complete with implementation alone. The affected work must add or update unit/API tests plus deployed browser, negative/error, authorization, Admin, payment, mobile and game-runtime certification where those concerns apply. A defect found in QA or UAT becomes a permanent regression test before the fix is considered complete.
