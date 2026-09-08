# Game Arena

Game Arena is a mobile-first HTML5 gaming platform for Pakistan. It combines swipe-based discovery, a curated free and premium catalogue, OTP accounts, Arena Coins, challenges, leaderboards, multiplayer room coordination, tournaments and Game Arena+ billing through an external Payment Service.

## Current launch architecture

The active staging and launch lane is the existing **self-managed/local-server Docker Compose deployment**.

- Repository: `Game-Arena-Codistan/platform`
- Staging: `https://gsmarena-play.codistan.org`
- Runtime: PostgreSQL + API + player web + private Admin + controlled game origin + gateway
- Staging Compose file: `infra/docker-compose.staging.yml`
- Deployment workflow: `.github/workflows/deploy.yml`
- Release images: `.github/workflows/release.yml`
- Current launch gate/source of truth: issue #48

AWS/EKS/S3/OpenTofu files remain in the repository as historical/optional infrastructure work. They are **not required for the current local-server staging, UAT or production-approval path**. Do not provision AWS for the current launch unless a new infrastructure decision explicitly reactivates that lane.

## Game Arena+

Game Arena+ provides the premium product experience, including full-catalogue access and other approved member benefits.

For the current payment architecture, monthly/yearly plan codes and prices are **server-authoritative from the external Payment Service catalogue**. The browser does not send a charge amount and hard-coded UI values are not the source of truth when external billing is enabled.

Current Premium payment boundary:

`Browser → Game Arena API/BFF → external Payment Service → JazzCash → Payment Service webhook → Game Arena API/PostgreSQL → entitlement`

The Payment Service product API key and webhook secret remain server-only. Browser return/redirect state never grants Premium access.

See [`docs/PAYMENT-SERVICE-INTEGRATION.md`](docs/PAYMENT-SERVICE-INTEGRATION.md) and [`docs/PAYMENTS.md`](docs/PAYMENTS.md).

## Repository

```text
apps/web/             Player-facing PWA
apps/api/             Platform API, migrations and provider/BFF adapters
apps/admin/           Private operations console
apps/game-ops/        Game validation, scanning and packaging
apps/game-origin/     Controlled immutable game origin
packages/game-bridge/ Game Bridge v1 SDK and schemas
infra/                Active local/Compose deployment plus optional historical cloud assets
catalogue/            Reviewed game release metadata and digests
docs/                 Architecture, security, operations and launch runbooks
.github/workflows/    CI, image publication, staging deployment and certification
```

## Development workflow

Start with:

- [`AGENTS.md`](AGENTS.md)
- [`CONTRIBUTING.md`](CONTRIBUTING.md)
- [`docs/AI-NATIVE-DEVELOPMENT.md`](docs/AI-NATIVE-DEVELOPMENT.md)
- [`docs/ISSUE-GOVERNANCE.md`](docs/ISSUE-GOVERNANCE.md)
- [`docs/decisions/README.md`](docs/decisions/README.md)
- [`docs/DEPLOYMENT-HANDOFF.md`](docs/DEPLOYMENT-HANDOFF.md)
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)
- [`docs/PAYMENT-SERVICE-INTEGRATION.md`](docs/PAYMENT-SERVICE-INTEGRATION.md)
- [`docs/QUALIFICATION.md`](docs/QUALIFICATION.md)
- [`docs/GO-LIVE.md`](docs/GO-LIVE.md)

Use normal PR/change-control rules and identify the exact validated SHA for every runtime change.

## Run locally

```bash
cd infra
docker compose up --build
```

- Player: `http://localhost:8080`
- API: `http://localhost:8081`
- Controlled game origin: `http://localhost:8082`
- Operations console: `http://localhost:8083`
- Demo OTP/payment modes are development-only

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
```

GitHub Actions also run PostgreSQL durability checks, API/business qualification, browser tests, Admin/RBAC checks, game/runtime QA, security scanning, immutable image publication and deployed staging certification.

## Architecture boundaries

- Games are treated as untrusted content, scanned before publication and served from a controlled origin.
- Current staging game files are persisted outside the application containers under the local server game-content path and mounted read-only into the game-origin service.
- Browser sessions use opaque HttpOnly cookies plus CSRF/origin controls.
- The API/PostgreSQL layer is authoritative for entitlements, wallet/ledger changes, play proof and operational state.
- The browser never receives external Payment Service credentials and never grants Premium from a redirect.
- The private Admin surface uses server-enforced signed-role authorization in staging certification.
- Rewards/competitions stay disabled for imported titles unless their integrity policy is explicitly approved.

## Delivery

Active current-lane delivery:

- `.github/workflows/vercel-preview.yml` — frontend-only mock previews.
- `.github/workflows/release.yml` — publishes commit-addressed application images.
- `.github/workflows/deploy.yml` — deploys the exact image SHA to the self-managed staging Compose server and invokes certification.
- `.github/workflows/aws-staging-certification.yml` — historical filename retained; currently certifies the Compose staging host.

Historical AWS infrastructure/deployment workflows may remain for future reuse, but they are not launch prerequisites for the current project scope.

## Current readiness boundary

The application/runtime is deployed and automated staging certification has reached `READY FOR UAT`. Issue #48 is the authoritative current launch gate.

Remaining current-launch work is:

1. real external Payment Service/JazzCash **staging UAT** under #158/#165/#166;
2. full developer/team **manual UAT**, defect fixes and retesting on the exact final SHA;
3. demo/evidence handoff as required;
4. **explicit production authorization** after UAT acceptance;
5. if real charging is part of launch, provider/finance readiness under #17.

Production is never authorized by a documentation change, merge or automated staging PASS.