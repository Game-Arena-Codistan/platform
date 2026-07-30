# Security Policy

## Private reporting

Do not disclose vulnerabilities in public issues, discussions or game reports. Contact the project owner through the private organization contact channel configured for the production service. Include the affected URL/version, reproduction steps, impact and minimal proof-of-concept material.

Until the final security mailbox is configured, organization administrators must handle reports privately and add the approved address here before launch.

Researchers should:

- Avoid accessing data or accounts that are not theirs
- Avoid service disruption, denial-of-service testing and social engineering
- Stop when sensitive data is encountered
- Delete retained sensitive material after coordinated handling
- Allow a reasonable remediation period before disclosure

## Scope and baseline

Game Arena targets OWASP ASVS Level 2 for the public platform, with additional controls for:

- OTP authentication, devices and session lifecycle
- JazzCash signing, callbacks, refunds and reconciliation
- Premium entitlement decisions
- Arena Coins, scores and competition integrity
- Untrusted HTML5 game ingestion and isolated execution
- Administrative authorization, dual approval and audit trails
- Data export, deletion and analytics minimization

The detailed model and evidence are in `docs/THREAT-MODEL.md` and `docs/SECURITY-VERIFICATION.md`.

## Trust boundaries

- Game runtimes execute on a separate origin in sandboxed iframes without same-origin permission.
- Games cannot access platform cookies, account/payment data or mutate rewards.
- Payment redirects never grant premium without backend verification.
- OTP values, session tokens and payment secrets never enter product analytics or browser authentication storage.
- Administrative changes are role-restricted and auditable.

## Dependency and build policy

Runtime dependencies must be justified, pinned, reviewed and covered by automated checks. Production game builds must pass the manifest, archive and static scanner, then publish as immutable versions. Never replace a published game version in place.

## Supported versions

Security fixes apply to the current production platform image and currently active game versions. Retired or affected game versions must be paused, rolled back or disabled through the catalogue/origin kill switch.

## Launch gate

Public launch requires no unresolved critical/high security finding, verified TLS/proxy/database controls and completed manual penetration, browser and sandbox testing.
