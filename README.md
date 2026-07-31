# Game Arena

Game Arena is a mobile-first HTML5 gaming platform for Pakistan. It combines swipe-based discovery, a curated free and premium catalogue, OTP accounts, fixed-duration JazzCash checkout, Arena Coins, challenges, leaderboards, multiplayer rooms and tournaments.

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

Checkout is implemented as a single JazzCash charge. Automatic renewal must not be promised unless the merchant arrangement, provider capability and customer disclosure are approved and implemented.

## Repository

The GitHub organization currently contains one application repository: `Game-Arena-Codistan/platform`.

```text
apps/web/             Player-facing PWA
apps/api/             Platform API, migrations and service adapters
apps/admin/           Private operations console
apps/game-ops/        Game validation, scanning and packaging
apps/game-origin/     Isolated immutable game server
packages/game-bridge/ Game Bridge v1 SDK and schemas
examples/             Reference game integration
infra/                Local Compose, Kubernetes and AWS OpenTofu
catalogue/            Imported catalogue audit artifacts
docs/                 Architecture, security, operations and launch runbooks
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

GitHub Actions additionally run player browser journeys, API and game-runtime qualification, production container builds, image SBOM/provenance publication, AWS OpenTofu validation and deployment-policy checks.

## Architecture boundaries

- Games are untrusted, scanned, versioned and served from a separate origin.
- Game Bridge messages require the exact source window, expected origin and v1 schema.
- Games request rewards; only the API can create ledger entries.
- Browser payment returns never activate premium; verified provider events do.
- Production authentication uses opaque HttpOnly cookies plus CSRF and origin controls.
- Production requires PostgreSQL. The current durable service intentionally uses one API writer replica; horizontal API writes require a later normalized repository migration.
- Optional product analytics is off by default and excludes identity, OTP, session and payment fields.
- The API uses the proxy-appended client address for abuse controls so a leading spoofed `X-Forwarded-For` value cannot bypass limits.

## Delivery

- **Frontend previews:** `.github/workflows/vercel-preview.yml` deploys `apps/web` to Vercel in mock mode. It does not expose backend, OTP or payment credentials.
- **Release images:** `.github/workflows/release.yml` publishes commit-addressed API, web, admin and game-origin images with provenance and SBOM metadata.
- **AWS infrastructure:** `.github/workflows/aws-infrastructure.yml` validates, plans and applies the reviewed OpenTofu AWS stack through protected GitHub Environments and OIDC.
- **AWS staging:** `.github/workflows/aws-staging.yml` deploys immutable images and records evidence.
- **AWS production:** `.github/workflows/aws-production.yml` accepts only an explicitly confirmed SHA with staging evidence and protected approval.
- **Rollback:** `.github/workflows/aws-rollback.yml` redeploys a previously healthy immutable SHA without destructive database rollback.

See:

- [`docs/AWS-DEPLOYMENT.md`](docs/AWS-DEPLOYMENT.md)
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)
- [`docs/PRODUCTION-READINESS.md`](docs/PRODUCTION-READINESS.md)
- [`docs/REPOSITORY-AUDIT.md`](docs/REPOSITORY-AUDIT.md)
- [`docs/OPERATIONS.md`](docs/OPERATIONS.md)
- [`docs/SECURITY-VERIFICATION.md`](docs/SECURITY-VERIFICATION.md)
- [`docs/QUALIFICATION.md`](docs/QUALIFICATION.md)
- [`docs/GO-LIVE.md`](docs/GO-LIVE.md)

## Completion boundary

Repository implementation is complete for the launch-candidate scope. Only three execution gates remain open:

1. **Game content deployment and rights** — issue #40.
2. **AWS environment deployment and production qualification** — issue #48.
3. **Live JazzCash merchant integration and verification** — issue #17.

OTP credentials, DNS/TLS, legal/operator approvals, physical-device evidence, backup/restore rehearsal and named launch owners are production-environment inputs or qualification evidence under issue #48. They are not unimplemented repository features.
