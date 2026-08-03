# AI-native development model

## Purpose

This document defines how Game Arena uses AI-assisted development after staging and production qualification. The goal is faster delivery without weakening contracts, security, evidence or operational ownership.

AI-native does not mean autonomous production changes. It means the repository contains enough structured context, tests, templates and guardrails for humans and AI tools to produce small, reviewable and reversible changes.

## Operating principles

1. **Repository context is authoritative.** Contracts, migrations, tests, `AGENTS.md` and runbooks travel with the code.
2. **Work is issue-shaped.** Every material change has a bounded outcome, non-goals, acceptance criteria and rollout boundary.
3. **Changes are evidence-shaped.** A pull request includes an immutable SHA and the tests, migrations, rollback and observability relevant to that SHA.
4. **High-risk effects remain server-authoritative.** Payments, entitlements, rewards, scores and administrator permissions cannot be delegated to browser state or game code.
5. **Deployment remains human-approved.** AWS apply, provider activation, game publication and production rollout stay behind protected environments.
6. **Architecture changes are explicit.** The modular monolith, normalized PostgreSQL and controlled game-origin model remain the default until an approved decision replaces a boundary.

## Context layers

A development agent should load context in this order:

1. `AGENTS.md` and any closer directory-specific instruction file.
2. The owning issue and linked launch gate.
3. Versioned API, Game Bridge or catalogue schemas.
4. Relevant migrations, services and tests.
5. Architecture, security, operations and qualification documents.
6. Recent pull requests that changed the same domain.

The agent should identify stale context rather than copying it into new work. A change that exposes drift should update the stale issue or document when practical.

## Standard work packet

Every feature, fix or game integration should be expressible as a work packet with:

- user or operator outcome;
- scope and explicit non-goals;
- affected applications and domain owner;
- API/schema and database impact;
- authorization and privacy impact;
- idempotency and concurrency behavior;
- failure, pause, rollback and kill-switch behavior;
- observability and success criteria;
- tests and deployment evidence;
- external dependency or decision.

The issue and pull-request templates capture these fields so an AI tool can plan from structured input instead of inferring critical requirements.

## Product-domain map

### Player experience

Owns discovery, library, account, wallet presentation, challenges, tournaments, rooms, accessibility and installed-PWA behavior. It consumes server-authoritative state and deterministic mock contracts.

### Identity and account

Owns OTP delivery, session rotation, device/session controls, account export/deletion and identity linking. Production sessions use secure cookies, CSRF and origin controls.

### Game Arena+

Owns plan versions, paid periods, entitlement lifecycle, member benefits, premium gating, administration and reporting. Current launch semantics are fixed-duration single-charge access.

### Payments and wallet

Owns payment attempts/events, reconciliation, refunds, top-ups, vouchers, Arena Coin ledger and benefit reversals. Provider callbacks and ledger effects are idempotent and auditable.

### Gameplay and competition

Owns play-session proof, score validation, rewards, leaderboards, challenges, tournaments and multiplayer coordination. Game code requests effects; the API decides and commits them.

### Game portfolio

Owns rights metadata, source classification, archive preflight, scanner findings, Game Bridge compatibility, immutable publication, certification, rollout and rollback.

### Operations and delivery

Owns admin capabilities, support, observability, WAF, budgets, backups, deployment evidence, runtime controls and incident response.

## Premium-feature development lane

Premium development should proceed in small vertical slices. A slice includes the player experience, API contract, database state, administration, audit trail and rollback behavior required for one outcome.

Candidate post-launch areas include:

- premium catalogue collections and personalized discovery;
- premium challenge seasons and reward policies;
- tournament passes and eligibility rules;
- family or household access research without enabling billing semantics prematurely;
- loyalty streaks and member missions;
- benefit experimentation with explicit cost and reversal ledgers;
- member support and account recovery improvements;
- retention and engagement reporting that does not misstate recurring revenue.

Each proposal must state whether it changes price, billing, entitlement, reward value, competition fairness or customer disclosure. Those dimensions require explicit product, finance, security and operations review.

## Game-integration lane

Game growth follows a portfolio pipeline rather than ad hoc catalogue edits:

1. **Discover:** create a stable slug, source checksum and runtime classification.
2. **Authorize:** record non-sensitive rights references and allowed modification/hosting/distribution.
3. **Preflight:** inspect archive size, entries, paths, encryption, compression and blocked files before extraction.
4. **Review:** scan files, dependencies, network calls, storage, permissions and trackers.
5. **Normalize:** produce a canonical HTML5 build and manifest.
6. **Bridge:** integrate and test lifecycle, readiness, pause, exit, score and reward requests.
7. **Publish:** create an immutable `slug/version` controlled-origin artifact.
8. **Certify:** test gameplay, devices, orientation, network profiles, integrity and accessibility.
9. **Roll out:** start paused at rollout `0`, then use evidence-backed staged rollout.
10. **Operate:** retain per-version pause, kill switch, rollback and incident ownership.

Static titles stay off Kubernetes. A title that needs authoritative realtime/server behavior enters a separately reviewed runtime lane.

## Release train after production

### Development

- issue-linked branch;
- deterministic local and CI checks;
- mock provider behavior where external systems are not required;
- contract and migration review.

### Staging

- exact reviewed SHA;
- real AWS/RDS and controlled-origin paths;
- provider sandbox where approved;
- browser/device, security, performance and rollback evidence.

### Production candidate

- exact staging-qualified SHA;
- launch-gate approval;
- provider, rights and operational readiness;
- rollout owner and rollback owner.

### Production rollout

- internal and beta exposure;
- percentage stages appropriate to risk;
- metrics and alarms evaluated at every stage;
- immediate pause/rollback path.

## AI review protocol

AI-generated changes receive the same review as human-written changes. Reviewers should verify:

- the change matches the issue rather than merely the prompt;
- architecture boundaries are preserved;
- generated code does not duplicate an existing service or contract;
- authorization is enforced server-side;
- database and idempotency behavior is tested;
- logs and errors do not expose sensitive values;
- the rollout statement does not overclaim environment readiness;
- documentation and issue state match the merged result.

Large generated diffs should be split by coherent outcome. Generated refactors that are not required for the outcome should be removed or proposed separately.

## Repository automation

`node scripts/check-ai-native-readiness.mjs` verifies the durable context files and templates required for this model. Platform Assurance runs it on pull requests and `main`.

The check is intentionally structural. Functional correctness remains covered by application, PostgreSQL, Compose, browser, security, game-runtime and deployment qualification.

## Governance and audit cadence

- Review open issues and launch-gate dependencies after every material staging or production milestone.
- Review documentation links and baselines monthly.
- Review provider, security, browser and runtime assumptions before every production release.
- Review game-portfolio rights and certification state before every catalogue rollout.
- Archive completed implementation issues; keep external evidence in the owning launch gate.
- Create a new architecture decision when a core boundary changes.

## Success criteria

The repository is AI-native development ready when a new contributor or agent can identify the correct domain, authoritative contract, validation path, rollout boundary and owning issue without relying on private chat history.