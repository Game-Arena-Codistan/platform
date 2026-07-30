# Backend foundation

The first backend slice is a modular Node.js API with stable contracts for catalogue, OTP sessions, entitlements, JazzCash checkout/webhooks, Arena Coins and play completion.

The default adapter is in-memory for CI and contract testing. PostgreSQL is the production system of record; `apps/api/migrations/001_initial.sql` defines the initial schema. The next implementation step replaces the memory adapter with a PostgreSQL repository and provider-specific SMS/email and JazzCash adapters.

## Trust rules

- The client never grants premium access.
- HTML5 games request rewards; the API validates and credits them.
- Coin changes are append-only and idempotent.
- OTP codes are hashed, single-use, short-lived and rate-limited.
- Browser sessions use opaque HttpOnly cookies.
- Payment webhooks require signature verification.
