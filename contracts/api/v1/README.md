# Game Arena API contract v1

This directory is the machine-readable handoff boundary between the player PWA and the modular-monolith API.

- `routes.json` freezes method, path, authentication mode, success status and the matching example.
- `mock-responses.json` provides deterministic non-secret payloads for Vercel preview, frontend tests and backend contract tests.
- `docs/BACKEND-HANDOFF.md` defines authentication, CSRF, idempotency, compatibility, payment and play-proof behavior.
- `node scripts/check-api-contract.mjs` rejects route drift, missing examples, preview secrets and unsafe AWS enablement.

The current contract version is `1.0.0`.

A breaking change requires a new version directory. Additive optional fields may remain within v1. Do not place provider credentials, database values, signed rights evidence or customer data in contract fixtures.
