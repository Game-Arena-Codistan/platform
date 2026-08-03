## Outcome

Describe the user, operator or engineering outcome.

## Linked work

- Issue:
- Launch gate, when applicable:
- Contract or schema:

## Scope

- Included:
- Excluded:

## Architecture and data

- Applications/services affected:
- API or Game Bridge changes:
- Database migration or projection changes:
- Authorization/privacy changes:

## Safety and operations

- Idempotency/concurrency behavior:
- Failure and rollback behavior:
- Feature flag, pause or kill switch:
- Observability and success criteria:

## Game integration

Complete this section for game or catalogue changes.

- Stable slug/version:
- Rights/provenance reference:
- Preflight/scanner result:
- Game Bridge lifecycle:
- Reward/competition certification:
- Initial rollout state:

## Validation

Exact head SHA:

```text
<commit-sha>
```

Commands and workflow runs:

- [ ] Repository security and AI-readiness checks
- [ ] Affected application tests
- [ ] API contract validation, when applicable
- [ ] PostgreSQL migration/durability/concurrency checks, when applicable
- [ ] Compose or browser qualification, when applicable
- [ ] Game runtime/publication checks, when applicable
- [ ] OpenTofu/deployment checks, when applicable

## Evidence boundary

- What this pull request proves:
- What still requires AWS, provider, device, rights or production evidence:

## Review checklist

- [ ] The change matches the linked issue and avoids unrelated refactoring.
- [ ] Contracts, migrations, tests and documentation agree.
- [ ] No secrets, customer data, game archives or signed agreements are included.
- [ ] Client code does not become authoritative for payments, entitlements, rewards, scores or administration.
- [ ] Rollback and operational ownership are clear.
- [ ] The description does not overclaim staging or production readiness.