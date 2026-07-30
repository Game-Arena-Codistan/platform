# Security Verification Record

Target: OWASP ASVS Level 2, supplemented for payments, game isolation, rewards and administration.

Status values: **Verified** means covered by code/tests/configuration in this repository. **Deploy check** requires the production environment. **Manual check** requires hands-on security testing.

| Area | Status | Evidence |
|---|---|---|
| Architecture and trust boundaries | Verified | `docs/THREAT-MODEL.md`; separate shell/API/game origins |
| Authentication secrets | Verified | Hashed short-lived OTP challenges; no plaintext code field |
| Authentication abuse controls | Verified | Identity/IP/device limits, resend delay, attempt cap and tests |
| Session lifecycle | Verified | Opaque cookies, rotation, device records, revocation and logout-all |
| CSRF and origin enforcement | Verified | CSRF cookie/header and approved-origin checks |
| Browser token storage | Verified | Production session token is HttpOnly; repository static check |
| Access control | Verified | User ownership checks and role-restricted administrative routes |
| Administrative accountability | Verified | Redacted audit log and dual approval for high-value adjustments |
| Input/body limits | Verified | Bounded JSON/form parsing and route validation |
| Output and security headers | Verified | API, shell and game-origin headers/CSP |
| Game ingestion | Verified | Manifest validation, traversal/symlink/executable/size/remote-code checks |
| Game isolation | Verified | Separate origin, sandbox without same-origin, permission manifest, kill switch |
| Game messaging | Verified | Exact origin/window, version, event allow-list, payload size and sensitive-key deny-list |
| Reward integrity | Verified | Server play sessions, nonce/version/plausibility/rate checks, append-only ledger |
| Payment integrity | Verified | Hosted checkout signing boundary, signature verification, idempotency, reconciliation and refund states |
| Entitlement integrity | Verified | Server entitlement source-of-truth and historical transitions |
| Data export/deletion | Verified | Authenticated export and deletion-request flows |
| Logging privacy | Verified | Structured redaction and bounded telemetry |
| Repository secrets/dependencies/static rules | Verified | `scripts/security-check.mjs` and platform assurance workflow |
| TLS, cookie domain and proxy behavior | Deploy check | Verify after DNS/TLS/reverse-proxy configuration |
| Production database authorization and encryption | Deploy check | Verify managed database roles, network policy and backup encryption |
| OTP provider contract and throttling | Deploy check | Requires approved production provider |
| JazzCash merchant callback and settlement | Deploy check | Requires merchant credentials and provider test account |
| Penetration test / sandbox escape attempts | Manual check | Execute against deployed staging build |
| Critical/high findings | No open repository finding | Deployment and manual findings must be zero before launch |

## Automated negative tests

- Missing CSRF is rejected.
- Invalid OTP and excessive attempts are rejected.
- Checkout creation alone does not grant premium.
- Duplicate payment events and reward completions are idempotent.
- Unsupported Bridge versions, wildcard destinations, oversized payloads and sensitive telemetry keys are rejected.
- Untrusted game files, remote scripts, insecure resources and changed immutable versions are rejected.
- Administrative routes reject missing roles/credentials.

## Launch rule

Do not declare public readiness until all **Deploy check** and **Manual check** rows have recorded evidence and no unresolved critical/high finding.
