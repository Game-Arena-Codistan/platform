# Security Policy

## Reporting

Do not disclose vulnerabilities in public issues. Contact the project owner privately with the affected URL, reproduction steps, impact and any proof-of-concept material. Avoid accessing data that is not yours, disrupting service or retaining sensitive information.

## Security baseline

Game Arena targets OWASP ASVS Level 2 for the public platform, with additional review for:

- OTP authentication and session lifecycle
- JazzCash request signing, callbacks and reconciliation
- Premium entitlement decisions
- Arena Coins and reward integrity
- Untrusted HTML5 game ingestion and execution
- Administrative authorization and audit trails

## Trust boundaries

- Game runtimes execute on a separate origin in sandboxed iframes.
- Games cannot access platform cookies or directly mutate rewards.
- Payment redirects never grant premium access without backend verification.
- OTP values, session tokens and payment secrets must never enter analytics or client storage.
- Administrative changes must be attributable and auditable.

## Dependency policy

The frontend release candidate has no runtime package dependencies. Future dependencies require an owner, a documented reason, lockfile review and automated vulnerability scanning.

## Supported versions

Security fixes apply to the current production version. Retired game versions should be disabled through the catalogue kill switch rather than left publicly reachable.
