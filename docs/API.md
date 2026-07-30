# API contracts

Base path in the same-origin deployment is `/api/v1`; application routes below omit the `/api` gateway prefix.

## Public

- `GET /healthz`, `GET /readyz`
- `GET /v1/catalog/games`, `GET /v1/catalog/games/:id`
- `POST /v1/auth/otp`, `POST /v1/auth/otp/verify`
- `POST /v1/payments/jazzcash/webhook`, `POST /v1/payments/jazzcash/return`
- `GET /v1/leaderboards/:gameId`
- `GET /v1/challenges`, `GET /v1/tournaments`
- `POST /v1/events` for opted-in, allow-listed de-identified events

## Authenticated player

- `GET /v1/session`
- `POST /v1/auth/logout`, `POST /v1/auth/logout-all`
- `GET /v1/account/sessions`, `DELETE /v1/account/sessions/:id`
- `GET /v1/account/export`, `DELETE /v1/account`
- `GET /v1/entitlements/me`
- `POST /v1/payments/jazzcash/checkout`, `GET /v1/payments/:id`
- `GET /v1/wallet`
- `POST /v1/play-sessions`, `POST /v1/play-sessions/:id/complete`
- `POST /v1/challenges/:id/claim`
- `POST /v1/tournaments/:id/join`

State-changing browser requests require the session cookie, `x-csrf-token` and an approved `Origin`. Checkout creation accepts an `Idempotency-Key` header.

## Administrative

Administrative routes require the approved upstream MFA/SSO gateway and the API role/key boundary.

- `GET /v1/admin/metrics`, `GET /v1/admin/audit`
- `GET /v1/admin/users`
- `GET /v1/admin/payments`, `POST /v1/admin/payments/reconcile`
- `POST /v1/admin/payments/:id/refund`
- `GET /v1/admin/games`, `PATCH /v1/admin/games/:id`, `POST /v1/admin/games/:id/state`
- `GET /v1/admin/reviews`
- `POST /v1/admin/coins/adjustments`, `POST /v1/admin/coins/adjustments/:id/approve`

## Error and authority model

Errors use:

```json
{"error":{"code":"...","message":"...","requestId":"...","details":{}}}
```

The server is authoritative for sessions, payment status, entitlements, game availability, scores, competition eligibility and Arena Coins. Browser redirects and game messages never grant premium or ledger value directly.
