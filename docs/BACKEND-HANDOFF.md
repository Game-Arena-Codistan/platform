# Frontend–backend handoff contract

## Status

This document freezes the integration boundary for the player PWA, the modular-monolith API and the first AWS staging deployment.

- Contract version: `1.0.0`
- Canonical route manifest: `contracts/api/v1/routes.json`
- Canonical preview and test examples: `contracts/api/v1/mock-responses.json`
- Drift check: `node scripts/check-api-contract.mjs`
- Vercel remains `mode: 'mock'`.
- AWS staging will use `mode: 'live'` after account provisioning.
- Production activation remains disabled until AWS qualification, game rights/certification, OTP and JazzCash are complete.

The contract describes the API already implemented in `apps/api`. It does not authorize public production use.

## Environment boundary

| Environment | Frontend | API/data | OTP | JazzCash | Games |
|---|---|---|---|---|---|
| Vercel preview | PWA preview | deterministic mock contract | mock code `123456` | mock checkout | demo/static preview only |
| Local Compose | local PWA | memory or local PostgreSQL | mock | mock | local controlled origin |
| AWS staging | immutable web image | API + RDS PostgreSQL | mock initially | mock initially | private controlled origin |
| Production | promoted staging SHA | API + RDS PostgreSQL | approved provider | approved hosted flow | certified immutable builds only |

No AWS, database, OTP, JazzCash, administrator, signing or customer secret belongs in Vercel.

## Transport and compatibility

- Base path: `/v1`.
- JSON request and response bodies use `application/json`.
- Every response may include `x-request-id`.
- The backend may add optional response fields without a contract version change.
- Removing or renaming a field, changing a field type, changing an HTTP status or tightening a previously valid request requires a new contract version.
- Dates use ISO 8601 strings unless the existing API explicitly returns epoch milliseconds.
- Identifiers are opaque strings. Clients must not infer meaning from UUIDs or prefixes.
- Catalogue game IDs use lowercase slugs matching `^[a-z0-9-]+$`.

## Authentication and CSRF

Player authentication uses an opaque HttpOnly session cookie. The browser cannot read the session cookie.

Authenticated mutations require:

1. the session cookie;
2. the readable CSRF cookie;
3. the same CSRF value in `x-csrf-token`;
4. an allowed `Origin`.

The frontend sends `credentials: 'include'`. It must treat `401 authentication_required` as signed out and `403 origin_rejected` as a deployment/configuration failure.

Administrator APIs are outside the player contract and continue to use signed identity-proxy assertions with server-enforced roles.

## Idempotency

`idempotency-key` is mandatory for:

- membership checkout;
- Arena Coin top-up checkout.

The same user, operation and idempotency key must return the original transaction rather than creating a second charge.

Play completion is idempotent by `playSessionId`. A repeated verified completion returns the stored reward and balance.

## Error model

All JSON errors use:

```json
{
  "error": {
    "code": "authentication_required",
    "message": "Sign in is required.",
    "details": {}
  }
}
```

The UI should branch on `error.code`, not English text. The initial stable codes include:

- `invalid_request`
- `authentication_required`
- `origin_rejected`
- `rate_limited`
- `invalid_otp`
- `otp_resend_too_soon`
- `otp_attempts_exceeded`
- `game_not_found`
- `premium_required`
- `free_play_limit_reached`
- `result_rejected`
- `transaction_not_found`
- `offer_not_found`
- `voucher_not_found`
- `multiplayer_unavailable`
- `invalid_room_name`
- `invalid_room_size`
- `invalid_support_message`
- `persistence_unavailable`
- `internal_error`

Unknown codes must render a safe generic message and retain the request ID for support.

## Catalogue and game delivery

The catalogue response is metadata only. It never contains source archives or private rights material.

A game is launchable only when all of these are true:

- `status` is `active`;
- `rolloutPercentage` is greater than zero;
- the user is inside the rollout;
- the user satisfies free/premium eligibility;
- an immutable version is present;
- the controlled-origin URL matches that exact version;
- the version is not paused or killed.

The four oversized pilot titles remain `paused` with rollout `0` until AWS staging publication and certification complete.

## Payments

The browser return URL is not authoritative. It always lands in a pending state and polls `GET /v1/payments/{transactionId}`.

Only a verified provider notification may move a transaction to `paid` and activate an entitlement or credit coins.

Supported transaction states for the handoff are:

- `pending`
- `paid`
- `failed`
- `cancelled`
- `refunded`
- `voided`

Automatic renewal is not part of contract `1.0.0`.

## Play proof and rewards

The API creates a play session containing:

- `playSessionId`
- exact `gameVersion`
- server-issued `nonce`

Completion must send the same version and nonce plus score and duration. A game may be playable while rewards remain disabled. The server is the only writer to wallet, entitlement and score state.

Completion results are:

- `verified`: accepted and eligible for policy-controlled reward;
- `review`: recorded but not rewarded automatically;
- `rejected`: invalid request/proof.

## Frontend implementation rules

The existing PWA adapter is `apps/web/src/api.js`.

- `mode: 'mock'` uses the deterministic values represented in `mock-responses.json`.
- `mode: 'live'` calls the versioned API and includes credentials.
- The frontend must not call AWS services, RDS, Secrets Manager, payment providers or OTP providers directly.
- The frontend must not infer premium activation from a redirect.
- The frontend must not construct game URLs outside the configured controlled origin.
- The frontend must tolerate optional fields and empty collections.

## Backend implementation rules

The primary team should preserve the launch architecture:

- one modular-monolith API writer;
- atomic PostgreSQL commits before mutation acknowledgement;
- restricted application database role;
- exact server-side authorization;
- no shared deployed administrator API keys;
- payment and reward state transitions inside transactions;
- immutable game version records;
- active-version, pause and rollout changes as database state, not artifact mutation.

## Handoff test sequence

Before connecting Vercel to AWS staging:

1. Run `node scripts/check-api-contract.mjs`.
2. Run the complete repository CI matrix.
3. Deploy the exact `main` SHA to AWS staging with OTP and JazzCash in mock mode.
4. Set the PWA staging configuration to `mode: 'live'`, the staging API origin and the controlled game origin.
5. Execute anonymous catalogue, OTP login, session rotation, logout and account journeys.
6. Execute mock membership and top-up transactions and verify persistence after API restart.
7. Execute play start/completion, duplicate completion and invalid-proof cases.
8. Verify premium gating, wallet, leaderboard, rooms and support.
9. Verify all four pilot games with rollout `0` before controlled manual activation.
10. Record evidence under issue #48.

## Change control

A contract change PR must update:

- `routes.json`;
- `mock-responses.json`;
- the frontend adapter when applicable;
- API implementation/tests when applicable;
- this handoff document for behavioral changes.

CI rejects missing routes, missing examples, preview secrets and frontend/backend route drift.
