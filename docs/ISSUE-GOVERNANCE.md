# Issue governance

## Purpose

GitHub issues are the durable work and decision record for Game Arena. They should describe current reality, not preserve obsolete implementation assumptions after the repository changes.

## Issue classes

### Launch gate

Tracks an external or deployed-environment condition required for staging or production. Launch gates remain open until evidence exists in the actual environment.

Examples: AWS deployment, live provider onboarding, licensed-game publication.

### Epic

Tracks a product or platform outcome delivered through several coherent changes. Close the epic when repository implementation is complete and move remaining environment evidence to the owning launch gate.

### Feature or fix

Tracks one bounded user, operator or engineering outcome. The issue should be implementable in one focused pull request or a small sequence with explicit dependencies.

### Game onboarding

Tracks one title or one controlled batch through source, rights, preflight, bridge, publication, certification and rollout.

### Operations

Tracks environment configuration, maintenance, incident response, cost, backup, security or release governance.

## Priority convention

- `P0`: active launch, security, data-loss or production-blocking work.
- `P1`: committed next-release work with a named owner and acceptance boundary.
- `P2`: planned roadmap work that is not blocking the current release.
- `P3`: exploration, optimization or optional future work.

Priority must describe current impact. Remove a P0 classification when the blocker is resolved or no longer required for the active release.

## Required issue content

A material issue should include:

- outcome;
- context and current state;
- scope and non-goals;
- dependencies and owning launch gate;
- API, data, authorization and operational impact where applicable;
- acceptance criteria;
- evidence and closing rule.

Use checkboxes for evidence that can be independently verified. Do not leave a completed implementation issue open solely because a separate launch gate has not run.

## Lifecycle

### Proposed

The outcome is understood but not scheduled. Dependencies and product decisions may still be open.

### Ready

Acceptance criteria are bounded, dependencies are identified and the issue can be implemented without private context.

### In progress

A branch or pull request is active. Link the pull request and keep material scope changes in the issue.

### Repository complete

Code, tests, contracts, migrations and documentation are merged. Close the issue if its remaining work is only deployment or external evidence tracked elsewhere.

### Environment complete

The exact deployed SHA has the required staging or production evidence. Close the launch gate only when its completion rule is satisfied.

### Superseded

Close with `not planned` or an explanatory comment when a newer issue or architecture replaces the work. Link the replacement.

## Closing rules

Close an implementation issue when:

- the owning pull request is merged;
- the acceptance criteria covered by repository work pass;
- documentation and contract state match the merged behavior;
- any remaining provider, rights, AWS, device or rollout work is linked to a launch gate.

Do not close a launch gate based only on local tests, CI, Vercel mock deployment or an infrastructure plan.

## Baseline maintenance

When a new staging candidate is merged:

1. Update #48 with the exact candidate SHA.
2. Update or close handoff issues that reference older baselines.
3. Remove closed prerequisites from active epic descriptions.
4. Record which checks ran and which evidence still requires AWS, providers or devices.
5. Keep Vercel mock status separate from AWS staging status.

## Triage cadence

Perform issue triage:

- after each material staging or production milestone;
- before starting a new premium-feature cycle;
- before each game-onboarding batch;
- monthly while the product is actively developed.

During triage:

- close completed repository issues;
- merge duplicates into one authoritative issue;
- correct stale priority and baseline references;
- verify every open issue has a current outcome and closing rule;
- keep secrets, customer data, source archives and signed agreements out of issue comments.

## Pull-request linkage

Use closing keywords only when the pull request fully satisfies the issue. Use `Relates to` when deployment, provider or human evidence remains.

Every material pull request should identify:

- the issue it closes or advances;
- exact head SHA;
- validation evidence;
- migration and rollback behavior;
- environment work that remains.

## AI-assisted triage

AI tools may summarize, classify and propose issue updates. A human reviewer should verify any action that changes priority, closes a launch gate, alters product commitments or changes production scope.

AI-assisted cleanup should prefer evidence-backed comments and concise issue bodies over preserving long historical narratives in the active acceptance criteria.