# Contributing to Game Arena

Game Arena is developed through reviewable, issue-linked changes. The repository supports both human and AI-assisted implementation, but the same architecture, security and evidence standards apply to every contributor.

Read `AGENTS.md` before changing code.

## Before starting

- Work from the latest `main` branch.
- Link the change to an existing issue or create a bounded issue using the repository templates.
- Confirm whether the change affects contracts, database schema, payments, entitlements, rewards, games, administration, AWS or production controls.
- Keep unrelated cleanup out of high-risk changes.

## Branches and pull requests

Use a descriptive branch such as:

- `feature/premium-family-plan-preview`
- `game/add-space-racer`
- `fix/payment-callback-idempotency`
- `docs/staging-runbook`

Open a pull request using the repository template. The pull request must include the exact head SHA and the validation performed against it.

Use squash merge for feature and fix pull requests unless a release or migration procedure explicitly requires another method.

## Local development

Start the complete local stack:

```bash
cd infra
docker compose up --build
```

Local endpoints:

- Player: `http://localhost:8080`
- API: `http://localhost:8081`
- Controlled game origin: `http://localhost:8082`
- Operations console: `http://localhost:8083`

Local OTP and JazzCash are mock-only. Local behavior does not prove provider, AWS staging or production readiness.

## Required validation

Run checks relevant to the change while developing. Before requesting merge, run the complete affected suite.

```bash
node scripts/security-check.mjs
node scripts/check-ai-native-readiness.mjs
node scripts/check-pre-staging.mjs
node scripts/check-api-contract.mjs
node scripts/check-cloud-deployment.mjs
```

Application checks:

```bash
cd apps/web && npm ci --ignore-scripts --no-audit --no-fund && npm run ci
cd ../api && npm ci --ignore-scripts --no-audit --no-fund && npm run ci
cd ../admin && npm run ci
cd ../game-ops && npm run ci
cd ../../packages/game-bridge && npm run ci
```

Changes to persistence, deployment, browser journeys, game artifacts or release controls also require the appropriate PostgreSQL, Compose, Playwright, load, OpenTofu and game-runtime workflows.

## API and database changes

- Change the versioned API contract when request or response behavior changes.
- Preserve backwards compatibility or introduce an explicit contract version.
- Add forward-only migrations and document the rollback or recovery procedure.
- Keep deployed state in normalized PostgreSQL repositories.
- Prove idempotency, transaction boundaries, restart durability and concurrency for material writes.
- Use bounded server-side queries and pagination for administrative reports.

## Payments and premium features

- Do not infer payment success from a browser return.
- Preserve provider-event verification and stored amount/currency/reference matching.
- Keep plan snapshots immutable after purchase.
- Separate paid activation, extension, audited manual access and free access.
- Keep current fixed-duration single-charge semantics unless recurring capability is separately approved.
- Test authorization, refund/reversal, redaction, timezone and audit behavior.

## Adding or changing a game

Use the game-onboarding issue template.

- Do not commit archives or expanded game builds.
- Record source, rights, checksum and runtime classification.
- Run bounded preflight and scanning.
- Publish immutable `slug/version` artifacts through the protected workflow.
- Add or validate Game Bridge lifecycle behavior.
- Keep a new title paused at rollout `0` with rewards and competitions disabled until certification is recorded.
- Include kill-switch and rollback evidence.

## Security and privacy

Never commit or paste into issues or pull requests:

- AWS or provider credentials;
- private keys or registration tokens;
- customer identity or payment data;
- raw provider webhooks;
- signed rights or commercial agreements;
- production secret values.

Use non-sensitive references and protected secret stores.

## Documentation

Update the relevant runbook, contract or architecture document when behavior changes. Avoid duplicating the same operational instruction across multiple documents; link to the authoritative source.

## Definition of done

A code change is complete when implementation, tests, contracts, migrations, documentation, observability and rollback controls agree. Environment work is complete only after deployed evidence is attached to the owning launch issue.