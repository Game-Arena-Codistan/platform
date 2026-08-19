# Staging Admin role mapping

Canonical non-secret QA identities for staging certification:

```json
{
  "autoqa-admin@game-arena.invalid": ["admin"],
  "autoqa-operator@game-arena.invalid": ["operator"],
  "autoqa-support@game-arena.invalid": ["support"],
  "autoqa-security@game-arena.invalid": ["security"],
  "autoqa-finance@game-arena.invalid": ["finance"]
}
```

`autoqa-unmapped@game-arena.invalid` is deliberately absent and is used for negative authorization tests.

## Expected capabilities

- `admin`: subscription read, plan management, subscription adjustment, reconciliation execution, report read/export.
- `finance`: subscription read/adjustment, reconciliation execution, report read/export.
- `support`: subscription read and report read.
- `operator`: subscription read and report read.
- `security`: report read only.

The canonical mapping is stored at `tests/staging/admin-role-mapping.json` and the staging assertion generator uses it automatically when no override is provided.

## Protected runtime requirements

The identity mapping is not a credential. Authentication still requires protected staging runtime configuration:

- `ADMIN_AUTH_MODE=signed-headers`
- `ADMIN_PROXY_SECRET=<protected random signing secret>`

The API staging server must use the same canonical mapping as `ADMIN_IDENTITY_ROLES_JSON` if its runtime configuration does not otherwise inject it. Never commit or paste `ADMIN_PROXY_SECRET`.
