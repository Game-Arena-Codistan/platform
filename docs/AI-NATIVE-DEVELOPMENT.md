# AI-native development model

## Purpose

This document defines how Game Arena uses AI-assisted development without weakening contracts, security, evidence or operational ownership.

AI-native does not mean autonomous production changes. It means the repository contains enough structured context, tests, templates and guardrails for humans and AI tools to produce small, reviewable and reversible changes.

## Operating principles

1. **Repository context is authoritative.** Contracts, migrations, tests, `AGENTS.md` and current runbooks travel with the code.
2. **Work is issue-shaped.** Every material change has a bounded outcome, non-goals, acceptance criteria and rollout boundary.
3. **Changes are evidence-shaped.** A pull request includes an immutable SHA and the tests, migrations, rollback and observability relevant to that SHA.
4. **High-risk effects remain server-authoritative.** Payments, entitlements, rewards, scores and administrator permissions cannot be delegated to browser state or game code.
5. **Deployment remains human-approved.** Provider activation, production rollout and any future infrastructure migration stay behind explicit review/approval.
6. **Architecture changes are explicit.** The modular monolith, PostgreSQL, controlled game-origin and active local Docker Compose deployment remain the defaults until an approved decision replaces a boundary.
7. **Historical infrastructure is not current intent.** AWS/OpenTofu/Kubernetes files may remain in the repository, but an agent must not infer that AWS provisioning is required for the current launch.

## Context layers

A development agent should load context in this order:

1. `AGENTS.md` and any closer directory-specific instruction file.
2. The owning issue and linked launch gate; #48 is the current deployment/UAT source of truth.
3. Versioned API, Game Bridge or catalogue schemas.
4. Relevant migrations, services and tests.
5. Current architecture, payment, security, operations and qualification documents.
6. Recent pull requests that changed the same domain.

The agent should identify stale context rather than copying it into new work.

## Standard work packet

Every feature, fix or game integration should identify:

- user/operator outcome;
- scope and non-goals;
- affected apps/domain owner;
- API/schema/database impact;
- authorization/privacy impact;
- idempotency/concurrency behavior;
- failure, rollback and kill-switch behavior;
- observability/success criteria;
- tests/deployment evidence;
- external dependency/decision.

## Product-domain map

### Player experience

Owns discovery, library, account, wallet presentation, challenges, tournaments, rooms, accessibility and PWA behavior. It consumes server-authoritative state.

### Identity and account

Owns OTP delivery, sessions/devices, account export/deletion and identity linking. Deployed sessions use secure cookies, CSRF and origin controls.

### Game Arena+

Owns plan presentation, subscription/entitlement lifecycle, member benefits, premium gating, administration and reporting.

When external billing is enabled, the Payment Service plan catalogue is authoritative for plan codes/prices and subscription state is reconciled server-side.

### Payments and wallet

Current Premium subscription boundary:

`Browser → Game Arena API/BFF → external Payment Service → JazzCash → Payment Service webhook → Game Arena API/PostgreSQL → entitlement`

The browser never receives the product API key/webhook secret, never supplies authoritative `userId` or amount, and never grants Premium from a redirect.

Legacy direct JazzCash code may remain for unrelated non-subscription compatibility; do not use it as the current Premium integration model.

### Gameplay and competition

Owns play-session proof, score validation, rewards, leaderboards, challenges, tournaments and multiplayer coordination. Game code requests effects; the API decides/commits them.

### Game portfolio

Owns rights metadata, source classification, archive preflight, scanner findings, Game Bridge compatibility, immutable publication, certification, rollout and rollback.

### Operations and delivery

Owns Admin capabilities, support, observability, backups, deployment evidence, runtime controls and incident response. Current delivery uses the self-managed/local Docker Compose lane.

## Premium-feature development lane

Premium development should proceed in small vertical slices spanning player UX, BFF/API contract, PostgreSQL state, administration, audit and rollback.

Any proposal that changes pricing, billing, entitlement, reward value, competition fairness or customer disclosure requires explicit product/finance/security/operations review.

Payment-specific changes must preserve the external Payment Service trust boundary unless a separately approved architecture decision replaces it.

## Game-integration lane

Game growth follows a portfolio pipeline:

1. Discover stable slug/source checksum/runtime classification.
2. Authorize rights/hosting/modification references.
3. Preflight archive safety before extraction.
4. Review files/dependencies/network/storage/permissions.
5. Normalize the approved HTML5 build and manifest.
6. Integrate/test Game Bridge where required.
7. Publish immutable `slug/version` controlled-origin content.
8. Certify gameplay/device/orientation/network/integrity behavior.
9. Roll out with pause/percentage/kill-switch controls.
10. Operate with retained version rollback and incident ownership.

The current exact-60 staging portfolio is already published to the local controlled origin. Broader portfolio expansion is separate future work and must not be mistaken for a current launch blocker.

## Release train

### Development / PR

- issue-linked branch;
- deterministic local/CI checks;
- mock provider behavior where external systems are not required;
- contract/migration/security review;
- no secret values in source control.

### Staging

- immutable image publication for the exact reviewed SHA;
- deployment through the active self-managed Compose lane;
- exact release identity checks;
- automated staging certification;
- human/manual UAT after `READY FOR UAT`;
- real Payment Service staging UAT when payment launch scope requires it.

### Production

Production remains a separate explicit owner-authorized action. No AI tool, merge, staging PASS or documentation change may infer production authorization.

If a future AWS/cloud migration is approved, treat it as a new architecture work packet with its own staging/rollback/cost/security evidence rather than reviving historical files automatically.