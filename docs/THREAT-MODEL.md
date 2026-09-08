# Game Arena threat model

## Scope

This model covers the player web shell, API/BFF, account identity, external Payment Service/JazzCash boundary, Arena Coins, competitions, private administration, game ingestion and sandboxed game runtime on the current self-managed/local-server deployment.

## Trust boundaries

1. **Player browser ↔ Game Arena API.** The browser is untrusted. Authentication uses opaque HttpOnly cookies; state-changing requests also require CSRF and an approved origin.
2. **Platform shell ↔ HTML5 game.** Games run on a controlled separate origin in sandboxed iframes. Messages require expected window/origin, Bridge schema and bounded payloads.
3. **Game submission ↔ controlled game origin.** Builds remain untrusted until archive/file/network/runtime checks pass. Published versions are immutable and rollout-controlled.
4. **Game Arena API/BFF ↔ external Payment Service.** The Game Arena server keeps the product API key secret, derives user identity from the authenticated session and never forwards an arbitrary browser amount.
5. **External Payment Service ↔ JazzCash/provider.** Provider wallet/payment behavior is outside Game Arena's browser trust boundary and is validated through the Payment Service contract/UAT.
6. **Payment Service webhook ↔ Game Arena API.** Raw-body HMAC/event validation and event-id idempotency are required. Browser redirects are not payment authority.
7. **Game Arena API ↔ OTP providers.** Delivery providers receive only approved destination/template/OTP data under the provider contract. OTPs remain short-lived and protected.
8. **Operations/Admin client ↔ Admin API.** Admin requests use server-enforced signed identity/role/capability authorization and audit-sensitive actions.
9. **Application ↔ PostgreSQL / persistent game-content storage.** Data, backups, access and recovery are controlled server-side. Application containers must not destroy persistent state during routine deployment.

## Protected assets

- account identities and sessions;
- OTP codes/provider metadata;
- Payment Service API key and webhook shared secret;
- safe payment/subscription references and authoritative state;
- Premium entitlements;
- Arena Coin ledger and competition results;
- game builds/manifests/publishing state;
- Admin signing/configuration and audit history;
- PostgreSQL and persistent game-content backups;
- service availability and player trust.

## Primary abuse cases and controls

| Threat | Control | Residual launch check |
|---|---|---|
| OTP guessing/flooding/enumeration | Uniform responses, hashing, expiry, attempt/resend/IP/device limits | Validate real provider behavior |
| Session theft/fixation | Opaque cookies, rotation, revocation, CSRF/origin controls | Verify production TLS/cookie/domain/proxy settings |
| Payment identity/amount tampering | Session-derived `userId`, server-side plan catalogue/BFF, no browser amount authority | Real Payment Service staging UAT |
| Webhook forgery/replay | Raw-body HMAC, event type validation, UUID/event-id idempotency, authoritative reconciliation | Provider staging webhook/retry evidence |
| Browser return-page trust | Redirect is navigation only; Game Arena polls/reconciles server-authoritative status | Real payment UAT |
| Provider secret exposure | Product API key/webhook secret only in API/server environment; logging/evidence redaction | Browser/log/video review |
| Coin or score inflation | Server-created play proof, nonce/version/policy/rate checks and idempotent ledger | Manual/runtime integrity checks |
| Malicious game build | Archive limits/scanner, immutable versions, isolated origin and kill switch | Review imported titles and exceptions |
| Sandbox/cookie escape | Separate origin, iframe sandbox, exact messaging boundary | Representative browser/game UAT |
| Admin privilege misuse | Signed identity/role/capability checks, audit, approval rules | Manual Admin/RBAC UAT |
| Data leakage in logs/analytics | Redaction and allow-listed telemetry | Review production telemetry/retention |
| Denial of service | body/request limits, rate controls, health checks, restart policy and kill switches | Load/recovery tests |

## Security invariants

- A game never grants coins or Premium directly.
- A browser redirect never grants an entitlement.
- The browser never receives `PAYMENT_SERVICE_API_KEY` or `PAYMENT_SERVICE_WEBHOOK_SECRET`.
- Browser-supplied `userId` or amount is never payment authority.
- A game frame never shares the privileged player origin.
- Retired/emergency-disabled versions remain unavailable.
- Financial, entitlement, publishing and administrative mutations are attributable/auditable.
- Routine application deployment does not destroy PostgreSQL or persistent game-content state.

## Deployment note

The current active deployment is the self-managed/local-server Docker Compose lane. Historical AWS/OpenTofu/Kubernetes files do not create an AWS provisioning requirement.

## Review triggers

Update this model when adding/changing a payment method or Payment Service contract, identity provider, game permission, cash-equivalent reward, analytics SDK, administrative role, native app, infrastructure architecture or cross-border data processor.