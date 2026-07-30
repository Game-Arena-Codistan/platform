# Game Arena

Game Arena is a mobile-first HTML5 gaming platform for Pakistan. It combines swipe-based discovery, a curated game catalogue, OTP accounts, JazzCash premium checkout, Arena Coins, challenges, leaderboards and tournaments.

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

Checkout is currently designed as a single JazzCash charge. Automatic renewal must not be promised unless the merchant/provider arrangement and customer disclosure are approved.

## Repository

```text
apps/web/             Player-facing PWA
apps/api/             Platform API, migrations and service adapters
apps/admin/           Private operations console
apps/game-ops/        Game validation, scanning and packaging
apps/game-origin/     Isolated immutable game server
packages/game-bridge/ Game Bridge v1 SDK and schemas
examples/             Reference game integration
infra/                Local Compose and portable Kubernetes deployment
catalogue/            Imported catalogue audit artifacts
docs/                 Architecture, security, operations and launch runbooks
.github/workflows/    Quality, previews, image publishing and cloud deployment
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
cd ../api && npm install && npm run ci
cd ../game-ops && npm run ci
cd ../../packages/game-bridge && npm run ci
node ../../scripts/security-check.mjs
node ../../scripts/check-cloud-deployment.mjs
```

GitHub Actions additionally build every production container, validate the DigitalOcean/AWS manifests and run the synthetic API launch profile.

## Architecture boundaries

- Games are untrusted, scanned, versioned and served from a separate origin.
- Game Bridge messages require an exact source window, exact origin and the v1 schema.
- Games request rewards; only the API can create ledger entries.
- Browser payment returns never activate premium; verified provider events do.
- Production authentication uses opaque HttpOnly cookies plus CSRF and origin controls.
- Production requires PostgreSQL. The current durable service repository intentionally uses one API writer replica; horizontal API writes require a later normalized repository migration.
- Optional product analytics is off by default and excludes identity, OTP, session and payment fields.

## Deployment

- **Frontend previews:** `.github/workflows/vercel-preview.yml` deploys `apps/web` to Vercel in mock mode after Vercel project secrets are configured. It does not expose backend, OTP or payment credentials.
- **Full staging/production:** `.github/workflows/deploy-kubernetes.yml` deploys the release images to either DigitalOcean Kubernetes or AWS EKS. It uses GitHub Environments, runs PostgreSQL migrations in-cluster, applies provider-specific TLS/routing and verifies health.
- **Images:** `.github/workflows/release.yml` publishes commit-addressed API, web, admin and game-origin images to GHCR.

See:

- [`docs/CLOUD-DEPLOYMENT.md`](docs/CLOUD-DEPLOYMENT.md)
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)
- [`docs/OPERATIONS.md`](docs/OPERATIONS.md)
- [`docs/SECURITY-VERIFICATION.md`](docs/SECURITY-VERIFICATION.md)
- [`docs/QUALIFICATION.md`](docs/QUALIFICATION.md)
- [`docs/GO-LIVE.md`](docs/GO-LIVE.md)

## Current status

The repository is a software-complete release candidate for the implemented scope. Vercel preview and DigitalOcean/AWS deployment automation are ready. The next owner decision is the cloud provider and environment access. Public launch still requires original licensed game builds, production OTP and JazzCash credentials, legal/operator approval and physical-device/payment testing tracked in GitHub issues #40 and #41.
