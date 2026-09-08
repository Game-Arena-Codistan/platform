# Architecture

Game Arena is a mobile-first HTML5 platform deployed through the current self-managed/local-server Docker Compose lane.

## Player/browser

- Static player PWA optimized for low-end mobile devices.
- Hash-based routes avoid server-side rendering requirements.
- Browser sessions use secure server-issued cookies; sensitive authority remains server-side.
- Games run in sandboxed iframes on a controlled separate origin.
- Browser code never grants Premium, writes Arena Coin balances or receives provider secrets.

## Backend

- Dependency-light Node.js modular monolith.
- PostgreSQL is the durable runtime source of truth.
- API/BFF owns authentication, entitlements, payments, rewards, game/runtime policy, administration and audit boundaries.
- Private Admin operations use server-enforced signed identity/role authorization.

## Game Arena+ payments

Current subscription boundary:

`Browser → Game Arena API/BFF → external Payment Service → JazzCash → Payment Service webhook → Game Arena API/PostgreSQL → entitlement`

The Payment Service plan catalogue is authoritative when external billing is enabled. Redirects/browser state never activate Premium.

## Games

- Game packages are scanned/qualified before controlled publication.
- Current staging game content persists on the self-managed server outside application containers and is mounted read-only into game-origin.
- Catalogue/runtime records select exact immutable versions and retain pause/rollout/kill-switch controls.

## Deployment

Active staging services are defined in `infra/docker-compose.staging.yml` and deployed through `.github/workflows/deploy.yml` after immutable image publication.

Historical AWS/OpenTofu/Kubernetes assets are optional/reference material and are not current launch prerequisites.

See `docs/DEPLOYMENT.md`, `docs/PAYMENT-SERVICE-INTEGRATION.md` and issue #48.