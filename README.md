# Game Arena

Game Arena is a mobile-first HTML5 gaming platform for Pakistan. It combines swipe-based discovery, a curated free and premium catalogue, OTP accounts, fixed-duration JazzCash checkout, Arena Coins, challenges, leaderboards, multiplayer room coordination and tournaments.

## Product model

### Free

- Selected catalogue
- Standard rewards and basic leaderboards
- Optional promotional placements
- Limits on selected games or features

### Game Arena+

- Full catalogue access
- Ad-free platform experience
- Premium challenges and tournaments
- 2× Arena Coins on eligible verified play
- 10% member top-up discount
- PKR 299 monthly or PKR 4,999 yearly

Checkout is a single JazzCash charge. Automatic renewal must not be promised unless merchant capability, provider terms, customer disclosure and a separately reviewed implementation are approved.

## Repository

The GitHub organization currently contains one application repository: `Game-Arena-Codistan/platform`.

```text
apps/web/             Player-facing PWA
apps/api/             Platform API, migrations and service adapters
apps/admin/           Private operations console
apps/game-ops/        Game validation, scanning and packaging
apps/game-origin/     Isolated demo and immutable-artifact gateway
packages/game-bridge/ Game Bridge v1 SDK and schemas
examples/             Reference game integration
infra/                Local Compose, Kubernetes and AWS OpenTofu
catalogue/            Reviewed game release metadata and digests
docs/                 Architecture, security, operations and launch runbooks
.github/workflows/    Quality, previews, content and protected AWS delivery
```

## Development workflow

The repository is prepared for human and AI-assisted development through durable context, structured work packets and CI-enforced guardrails.

Start with:

- [`AGENTS.md`](AGENTS.md) — repository operating contract for AI tools and contributors.
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — branches, validation, security and pull-request workflow.
- [`docs/AI-NATIVE-DEVELOPMENT.md`](docs/AI-NATIVE-DEVELOPMENT.md) — premium-feature, game-integration and post-launch delivery model.
- [`docs/ISSUE-GOVERNANCE.md`](docs/ISSUE-GOVERNANCE.md) — issue lifecycle, priorities, closing rules and audit cadence.

Use the structured GitHub issue templates for defects, features and game onboarding. Pull requests must use the repository template and identify an immutable validated head SHA.

Validate the durable development context with:

```bash
node scripts/check-ai-native-readiness.mjs
```

## Run locally

```bash
cd infra
docker compose up --build
```

- Player: `http://localhost:8080`
- API: `http://localhost:8081`
- Controlled game origin: `http://localhost:8082`
- Operations console: `http://localhost:8083`
- Local operations key: `local-admin-key` unless overridden
- Demo OTP: `123456`
- JazzCash: mock mode

## Validate

```bash
node scripts/security-check.mjs
node scripts/check-ai-native-readiness.mjs
node scripts/check-pre-staging.mjs
node scripts/check-api-contract.mjs
node scripts/check-cloud-deployment.mjs

cd apps/web && npm ci --ignore-scripts --no-audit --no-fund && npm run ci
cd ../api && npm ci --ignore-scripts --no-audit --no-fund && npm run ci
cd ../game-ops && npm run ci
cd ../../packages/game-bridge && npm run ci
node ../../scripts/security-check.mjs
node ../../scripts/check-cloud-deployment.mjs
```

GitHub Actions additionally run real PostgreSQL durability tests, API load tests, Chromium/Firefox/WebKit journeys, game archive/runtime QA, CodeQL, production container builds, AWS OpenTofu validation and protected deployment-policy checks.

## Architecture boundaries

- Games are untrusted, preflighted before extraction, scanned, versioned and served from a separate origin.
- Production game binaries are immutable `slug/version` objects in private S3, delivered through CloudFront and the isolated game hostname; they are not committed to platform Git history.
- Game Bridge messages require the expected source window, origin model and v1 schema.
- Games request rewards; only the API commits ledger entries, and every completion requires the exact server-issued nonce and game version.
- Browser payment returns never activate purchases. Authoritative notifications must match the stored merchant, bill reference, amount and currency.
- Production player authentication uses opaque HttpOnly cookies plus CSRF and origin controls.
- Production administration uses signed identity-proxy assertions, server-bound roles and a private MFA/SSO access layer. Shared keys are development-only.
- The launch API is a modular monolith backed by normalized PostgreSQL repositories. Acknowledged mutations wait for commit, restart durability is tested and stale concurrent writers are rejected.
- Migrations may use the RDS administrator credential; the running API is switched to a restricted application role after deployment.
- Uncertified external games and valuable competitions are disabled by default in production.
- Product analytics is off by default and excludes identity, OTP, session and payment fields.

## Next development phase

After staging and production qualification, the repository is designed to support two parallel growth lanes:

1. **Game Arena+ vertical slices** spanning player UX, API contract, normalized data, administration, audit, rollout and rollback.
2. **Portfolio-scale game onboarding** spanning source/rights, bounded preflight, scanning, Game Bridge, immutable publication, certification and controlled rollout.

New premium features must preserve current fixed-duration single-charge semantics unless recurring billing receives separate provider, product and compliance approval. New games start paused at rollout `0`, with rewards and competitions disabled until the relevant integrity and device evidence is recorded.

## Delivery

- **Frontend previews:** `.github/workflows/vercel-preview.yml` deploys the PWA in mock mode.
- **Release images:** `.github/workflows/release.yml` publishes commit-addressed images with provenance and SBOM metadata.
- **AWS infrastructure:** `.github/workflows/aws-infrastructure.yml` validates, plans and applies the reviewed OpenTofu stack through protected GitHub Environments and OIDC.
- **AWS staging:** `.github/workflows/aws-staging.yml` deploys immutable images, applies runtime controls and records evidence.
- **Runtime controls:** `.github/workflows/aws-runtime-controls.yml` installs the least-privilege database role, injects protected admin/support settings, applies WAF/TLS/access logs and verifies workloads.
- **Game publication:** `.github/workflows/game-content-import.yml` publishes reviewed immutable game versions and opens metadata-only PRs.
- **AWS production:** `.github/workflows/aws-production.yml` requires the qualified SHA, staging evidence, provider readiness and protected approval.
- **Rollback:** `.github/workflows/aws-rollback.yml` redeploys a previously healthy immutable SHA without destructive database rollback.

## Readiness

Repository-controlled launch blockers are implemented. The platform is ready for AWS staging provisioning, provider configuration, representative licensed-game import and full qualification.

The remaining completion boundary requires external inputs and execution:

1. **#17:** live JazzCash merchant credentials, field mapping, settlement/refund/reconciliation evidence.
2. **#40:** licensed game archives, rights evidence, immutable publication and device/runtime certification.
3. **#48:** actual AWS account provisioning, OTP/provider values, legal/operator contacts, staging evidence and controlled production rollout.

See:

- [`docs/DEPLOYMENT-HANDOFF.md`](docs/DEPLOYMENT-HANDOFF.md)
- [`docs/AWS-DEPLOYMENT.md`](docs/AWS-DEPLOYMENT.md)
- [`docs/FINAL-GO-LIVE-AUDIT.md`](docs/FINAL-GO-LIVE-AUDIT.md)
- [`docs/OPERATIONS.md`](docs/OPERATIONS.md)
- [`docs/SECURITY-VERIFICATION.md`](docs/SECURITY-VERIFICATION.md)
- [`docs/QUALIFICATION.md`](docs/QUALIFICATION.md)
- [`docs/GO-LIVE.md`](docs/GO-LIVE.md)
