# Security verification record

Target: OWASP ASVS Level 2, supplemented for payments, game isolation, rewards and administration.

Status values: **Verified** means covered by code/tests/configuration in this repository. **Deploy check** requires evidence from the deployed environment. **Manual check** requires hands-on testing.

| Area | Status | Evidence |
|---|---|---|
| Architecture/trust boundaries | Verified | `docs/THREAT-MODEL.md`; separate player/API/game/provider boundaries |
| Authentication secrets | Verified | Hashed short-lived OTP challenges; no plaintext code persistence |
| Authentication abuse controls | Verified | Identity/IP/device limits, resend delay, attempt cap and tests |
| Session lifecycle | Verified | Opaque cookies, rotation, device records, revocation and logout-all |
| CSRF/origin enforcement | Verified | CSRF cookie/header and approved-origin checks |
| Browser token storage | Verified | Session credential is HttpOnly; repository static checks |
| Access control | Verified | User ownership and server-enforced Admin role/capability boundaries |
| Administrative accountability | Verified | Redacted audit behavior and protected sensitive operations |
| Input/body limits | Verified | Bounded parsers and route validation |
| Output/security headers | Verified | API, shell and controlled game-origin headers/CSP |
| Game ingestion | Verified | Manifest/archive/path/file/size/remote-code checks |
| Game isolation | Verified | Separate origin, iframe sandbox, messaging boundary and kill switch |
| Reward integrity | Verified | Server play proof/version/nonce/policy checks and idempotent ledger behavior |
| Payment BFF identity/amount boundary | Verified | Session-derived user, server-authoritative plan code/price, no browser Payment Service secret |
| Payment webhook integrity | Verified | Raw-body HMAC/event validation, event-id idempotency/retry and authoritative reconciliation tests |
| Entitlement integrity | Verified | Server/PostgreSQL source of truth; browser return cannot grant Premium |
| Data export/deletion | Verified | Authenticated account/admin flows and redaction boundaries |
| Repository secret/dependency checks | Verified | `scripts/security-check.mjs`, Platform assurance and CodeQL |
| TLS/domain/reverse proxy | Deploy check | Verify current self-managed production target before go-live |
| Production PostgreSQL authorization/backups | Deploy check | Verify least privilege, backup/restore and network exposure |
| OTP production provider | Deploy check | Requires approved provider configuration |
| Real Payment Service/JazzCash staging | Deploy check | Requires #165/#166 provider-backed staging evidence |
| Live payment provider/finance readiness | Deploy check | #17 when real production charging is launch scope |
| Penetration/sandbox escape attempts | Manual check | Execute against deployed staging/final candidate |
| Critical/high findings | Launch gate | Must be zero before production approval |

## Current payment security model

Game Arena+ uses:

`Browser → Game Arena API/BFF → external Payment Service → JazzCash → Payment Service webhook → Game Arena API/PostgreSQL → entitlement`

Security rules:

- `PAYMENT_SERVICE_API_KEY` and `PAYMENT_SERVICE_WEBHOOK_SECRET` are server-only;
- browser-supplied `userId` and amount are not authoritative;
- plan catalogue/price is obtained through the server-side BFF;
- browser return/navigation state never grants Premium;
- webhook retries/duplicates cannot create duplicate entitlement effects;
- no MPIN, provider secret or raw secret-bearing payload appears in logs/evidence.

Legacy direct JazzCash adapter/config may remain for unrelated compatibility paths. It is not the current Game Arena+ subscription security boundary.

## Automated negative tests

Representative checks include:

- missing/invalid CSRF or origin is rejected;
- invalid OTP/excessive attempts are rejected;
- payment initiation alone does not grant Premium;
- malformed/unsigned/wrong-event Payment Service webhooks are rejected;
- duplicate/retried events remain idempotent;
- browser return cannot self-activate entitlement;
- unsupported/unsafe game messaging/content is rejected;
- Admin routes reject missing/invalid role/capability evidence;
- secret-pattern scanning rejects committed provider/cloud/application credentials.

## Deployment architecture note

The active staging/launch lane is self-managed/local-server Docker Compose. Historical AWS/EKS/S3/OpenTofu assets are optional/reference only and are not security prerequisites for the current launch.

## Launch rule

Do not declare production readiness until required **Deploy check** and **Manual check** rows for the chosen launch scope have recorded non-sensitive evidence, human UAT is accepted and no unresolved critical/high finding remains.

Production requires separate explicit owner authorization.