# Game Arena Threat Model

## Scope

This model covers the web shell, API, account identity, JazzCash payment boundary, Arena Coins, competitions, administration, the game ingestion pipeline and sandboxed game runtime.

## Trust boundaries

1. **Player browser ↔ platform API.** The browser is untrusted. Authentication uses opaque HttpOnly cookies; state-changing requests also require a CSRF token and an approved origin.
2. **Platform shell ↔ HTML5 game.** Games run on a separate origin in sandboxed iframes. Messages require an exact window, exact origin, Bridge v1 schema and bounded payload.
3. **Game submission ↔ controlled game origin.** Builds are untrusted until the manifest, ZIP paths, file types, expanded size, remote code, tracking endpoints and static APIs pass scanning. Published versions are immutable.
4. **Platform API ↔ JazzCash.** Redirects and browser returns are untrusted. Premium activates only after a verified, idempotent provider event.
5. **Platform API ↔ OTP providers.** Delivery providers receive only the destination, template and one-time code. Codes are hashed at rest and short-lived.
6. **Operations client ↔ administrative API.** Admin requests require a separately managed key and role. Sensitive actions create immutable audit events; high-value coin adjustments require a second administrator.
7. **Application ↔ database/object storage.** Production secrets and data belong to isolated environments. Backups, access, retention and restore are operational controls.

## Protected assets

- Account identities and sessions
- OTP codes and delivery metadata
- Payment references, transaction state and merchant credentials
- Premium entitlements
- Arena Coin ledger and competition results
- Game builds, manifests and publishing state
- Administrative credentials and audit history
- Service availability and player trust

## Primary abuse cases and controls

| Threat | Control | Residual launch check |
|---|---|---|
| OTP guessing, flooding or account enumeration | Uniform responses, hashed codes, expiry, resend interval, attempt limits, identity/IP/device rate limits, provider failover telemetry | Validate real provider throttling and delivery behavior |
| Session theft or fixation | Opaque random tokens, HttpOnly/SameSite/Secure cookies, rotation, device records, logout-all, revocation | Confirm TLS, proxy headers and production cookie domain |
| CSRF and cross-origin requests | Double-submit CSRF token plus origin allow-list | Verify deployed origins and reverse proxy behavior |
| Payment forgery, replay or return-page trust | HMAC verification, idempotent provider events, server transaction state, entitlement source-of-truth, reconciliation | Verify merchant credentials, provider callback fields and settlement reports |
| Coin or score inflation | Server-created play sessions, nonce/version checks, plausibility rules, rate controls, append-only ledger, idempotency and review state | Tune rules using real game telemetry |
| Malicious game build | ZIP traversal and file limits, executable blocking, remote-script/tracker detection, immutable versions, isolated origin, restrictive CSP | Review scanner exceptions for each imported build |
| Sandbox escape or cookie access | Separate origin, same-origin permission omitted, permission-by-manifest, exact postMessage origin/window | Browser test representative engines and games |
| Admin privilege misuse | Separate admin authentication, role checks, dual approval, redacted audit logs | Configure named administrators, MFA/SSO gateway and log retention |
| Data leakage through analytics/logging | Payload key deny-list, log redaction, no game access to account/payment data | Review production telemetry destinations and retention |
| Denial of service | Request/body/time limits, rate limits, static CDN/game origin, health checks and kill switches | Load test deployed API/database and configure edge limits |

## Security invariants

- A game never grants coins or premium directly.
- A payment redirect never grants an entitlement.
- Browser storage never contains a production authentication token.
- A game frame never shares the platform origin.
- Retired or emergency-disabled versions return an unavailable response.
- Every financial, entitlement, publishing and administrative mutation is attributable.

## Review triggers

Update this model when adding a payment method, identity provider, game permission, cash-equivalent reward, third-party analytics SDK, new administrative role, native application or cross-border data processor.
