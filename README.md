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

Checkout is designed as a single JazzCash charge. Automatic renewal must not be promised unless merchant capability, provider terms, customer disclosure and a separately reviewed implementation are approved.

## Repository

The GitHub organization currently contains one application repository: `Game-Arena-Codistan/platform`.

```text
apps/web/             Player-facing PWA
apps/api/             Platform API, migrations and service adapters
apps/admin/           Private operations console
apps/game-ops/        Game validation, scanning and packaging
apps/game-origin/     Isolated demo/static game server
packages/game-bridge/ Game Bridge v1 SDK and schemas
examples/             Reference game integration
infra/                Local Compose, Kubernetes and AWS OpenTofu
catalogue/            Imported catalogue audit artifacts
docs/                 Architecture, audits, security, operations and launch runbooks
.github/workflows/    Quality, previews, images and protected AWS delivery
```

## Run the complete local stack

```bash
cd infra
docker compose up --build
```

- Player platform: `http://localhost:8080`
- API: `http://localhost:8081`
- Controlled game origin: `http://localhost:8082`
- Operations console: `http://localhost:8083`
- Local operations key: `local-admin-key` unless overridden
- Demo OTP: `123456`
- JazzCash: mock mode only

The frontend can also run independently:

```bash
cd apps/web
npm run dev
```

## Validate

```bash
cd apps/web && npm run ci
cd ../api && npm install --no-audit --no-fund && npm run ci
cd ../game-ops && npm run ci
cd ../../packages/game-bridge && npm run ci
node ../../scripts/security-check.mjs
node ../../scripts/check-cloud-deployment.mjs
```

Existing GitHub Actions run frontend, API, game-runtime, container, load, AWS OpenTofu and deployment-policy checks. The final audit identified additional production-path tests and fixes that must be added before production qualification.

## Architecture boundaries

- Games are untrusted and must be scanned, versioned and served from a separate controlled origin.
- Game Bridge messages require the expected source window, origin model and v1 schema.
- Games request rewards; only the API may commit ledger entries.
- Browser payment-return handling must not be authoritative; provider notification and reconciliation must validate the stored transaction.
- Production player authentication uses opaque HttpOnly cookies plus CSRF and origin controls.
- Production administration must use identities with server-bound roles and MFA/SSO; local shared-key mode is development-only.
- Production requires transactionally durable PostgreSQL repositories. The current whole-state snapshot adapter is not the final production persistence model.
- Optional product analytics is off by default and excludes identity, OTP, session and payment fields.

## Delivery

- **Frontend previews:** `.github/workflows/vercel-preview.yml` deploys the PWA in mock mode.
- **Release images:** `.github/workflows/release.yml` publishes commit-addressed images with provenance and SBOM metadata.
- **AWS infrastructure:** `.github/workflows/aws-infrastructure.yml` validates, plans and applies the reviewed OpenTofu stack through protected GitHub Environments and OIDC.
- **AWS staging:** `.github/workflows/aws-staging.yml` deploys immutable images and records evidence.
- **AWS production:** `.github/workflows/aws-production.yml` requires a confirmed SHA, staging evidence and protected approval.
- **Rollback:** `.github/workflows/aws-rollback.yml` redeploys a previously healthy immutable SHA without destructive database rollback.

## Current readiness

**Initial AWS staging provisioning may proceed now** with the demo game, mock OTP and mock JazzCash. That deployment is an infrastructure shakeout for EKS, RDS, DNS, TLS, migrations, image delivery and rollback—not final qualification.

Before a release can be qualified for production, the P0 items in [`docs/FINAL-GO-LIVE-AUDIT.md`](docs/FINAL-GO-LIVE-AUDIT.md) must be merged and redeployed. They cover:

1. server-bound administrator identity and roles;
2. transactional PostgreSQL durability;
3. JazzCash ownership, expected-value and return/callback invariants;
4. production CSP, controlled-game origin and service-worker configuration caching;
5. mandatory play proof and competition feature gating;
6. safe ZIP preflight and a scalable game source/artifact delivery model.

After those code fixes, production still requires licensed games, actual AWS deployment and qualification, real OTP providers, live JazzCash merchant integration, legal/operator approval, monitoring and paging, backup/rollback evidence and physical-device testing.

See:

- [`docs/FINAL-GO-LIVE-AUDIT.md`](docs/FINAL-GO-LIVE-AUDIT.md)
- [`docs/AWS-DEPLOYMENT.md`](docs/AWS-DEPLOYMENT.md)
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)
- [`docs/PRODUCTION-READINESS.md`](docs/PRODUCTION-READINESS.md)
- [`docs/OPERATIONS.md`](docs/OPERATIONS.md)
- [`docs/SECURITY-VERIFICATION.md`](docs/SECURITY-VERIFICATION.md)
- [`docs/QUALIFICATION.md`](docs/QUALIFICATION.md)
- [`docs/GO-LIVE.md`](docs/GO-LIVE.md)
