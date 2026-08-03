# Game Arena agent operating contract

This file is the primary repository instruction set for AI-assisted and human development. It applies to the entire repository unless a more specific `AGENTS.md` is added inside a subdirectory.

## Mission

Extend Game Arena safely after staging and production qualification. The expected growth areas are Game Arena+ features, catalogue scale, game onboarding, player experience, operations and evidence-backed delivery.

## Repository map

- `apps/web`: player-facing progressive web application and deterministic Vercel mock preview.
- `apps/api`: modular-monolith API, normalized PostgreSQL repositories, migrations and provider adapters.
- `apps/admin`: private operations, Game Arena+ administration and reporting console.
- `apps/game-ops`: game archive preflight, scanning, packaging and publication tooling.
- `apps/game-origin`: isolated controlled-origin delivery gateway.
- `packages/game-bridge`: versioned bridge schemas and SDK used by platform-hosted games.
- `contracts/api`: versioned frontend/backend contract and deterministic mock responses.
- `catalogue`: reviewable release metadata and non-sensitive digests; never game binaries.
- `infra`: local Compose, Kubernetes and AWS OpenTofu.
- `docs`: architecture decisions, operations, qualification and delivery runbooks.

## Authoritative sources

Use these sources in this order:

1. Versioned contracts and schemas.
2. Database migrations and server-side authorization rules.
3. Repository tests and qualification scripts.
4. Architecture and operations documents.
5. Issue acceptance criteria that match the current `main` baseline.

When documentation and code disagree, do not silently choose one. Record the discrepancy in the pull request and update the stale source in the same change when practical.

## Change workflow

1. Start from the latest `main` commit and identify the owning issue or create a bounded issue.
2. State the user outcome, non-goals, affected domains, data changes, security boundary and rollout plan.
3. Prefer the smallest coherent change that preserves existing architecture.
4. Update contracts, migrations, tests, documentation and operational controls together.
5. Run the narrow checks while developing, then the complete affected qualification set before merge.
6. Use a pull request. Include an immutable head SHA, validation evidence, migration/rollback notes and any remaining external dependency.
7. Do not claim staging or production completion from local, CI or Vercel mock evidence.

## Architecture invariants

- Keep the launch backend a modular monolith unless an approved architecture decision demonstrates a need for another runtime boundary.
- PostgreSQL is the deployed source of truth. Acknowledged mutations must wait for commit and remain safe across restart and concurrent writers.
- Browser payment returns are never authoritative. Provider events must match stored merchant, reference, amount and currency.
- Games are untrusted content. They run from the controlled origin, communicate through the versioned Game Bridge and cannot write rewards directly.
- Arena Coin and paid-entitlement effects are server-authoritative, idempotent and auditable.
- Administration authorization is enforced by the API. Browser-hidden controls are not a security boundary.
- Vercel stays deterministic and mock-only unless a separately approved environment configuration connects it to a qualified staging backend.
- AWS access is OIDC-based and environment-protected. Never add long-lived cloud credentials.

## Game Arena+ feature rules

For premium work:

- Preserve the fixed-duration single-charge model until live recurring capability is explicitly approved.
- Keep plan versions and purchased benefit snapshots immutable.
- Separate paid activation, paid extension, audited manual access and free access.
- Keep calendar cash, recurring-customer classification and recurring-revenue metrics semantically distinct.
- Use backend-provided capabilities and totals in the admin application.
- Add migration, authorization, idempotency, refund/reversal, redaction, timezone and export tests when relevant.
- Define entitlement and reward behavior when a feature is paused, refunded, expired or rolled back.

## Game onboarding rules

For every title:

- Create or update a catalogue/rights record before activation.
- Keep source archives, expanded binaries and signed agreements outside Git.
- Use bounded ZIP preflight, scanner and immutable `slug/version` publication.
- Record checksums, provenance, rights reference, runtime class, orientation, network behavior and certification state.
- Integrate Game Bridge lifecycle events and declare whether score, completion, rewards and competitions are certified.
- Default new titles to paused, rollout `0`, rewards disabled and competitions disabled.
- Prove controlled-origin loading, CSP compatibility, lifecycle, kill switch and rollback before rollout.

## Validation matrix

Choose the narrowest relevant commands during development and run the complete affected set before merge.

```bash
node scripts/security-check.mjs
node scripts/check-ai-native-readiness.mjs
node scripts/check-pre-staging.mjs
node scripts/check-api-contract.mjs
node scripts/check-cloud-deployment.mjs

cd apps/web && npm ci --ignore-scripts --no-audit --no-fund && npm run ci
cd ../api && npm ci --ignore-scripts --no-audit --no-fund && npm run ci
cd ../admin && npm run ci
cd ../game-ops && npm run ci
cd ../../packages/game-bridge && npm run ci
```

Data, deployment, game-runtime and release changes also require the corresponding PostgreSQL, Compose, browser, load, OpenTofu or game-publication qualification workflow.

## Pull-request evidence

Every material pull request must describe:

- outcome and scope;
- issue and contract links;
- affected applications, routes, tables and operational controls;
- migrations and rollback or why neither applies;
- security/privacy effects;
- tests executed and exact head SHA;
- rollout, kill switch and observable success criteria;
- external dependencies that remain unresolved.

## Prohibited changes

- Secrets, provider credentials, private keys, customer data or signed commercial documents in GitHub.
- Game ZIPs, generated exports, mobile packages or expanded game binaries in this repository.
- Unversioned breaking API or Game Bridge changes.
- Client-authoritative balances, entitlements, payment success, score proof or administrator permission.
- Automatic production deployment or provider activation without protected approval and evidence.
- Broad refactors mixed into urgent launch, payment or security changes without explicit review.

## Completion standard

A repository task is complete when code, tests, contracts, migrations, documentation and operational controls agree. Staging and production tasks are complete only when the deployed environment evidence is recorded in the appropriate launch gate.