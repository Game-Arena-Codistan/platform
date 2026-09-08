# API contracts

Base path in the same-origin deployment is `/api/v1`; application routes below omit the `/api` gateway prefix.

## Public / provider-facing

- `GET /healthz`, `GET /readyz`
- `GET /v1/catalog/games`, `GET /v1/catalog/games/:id`
- `POST /v1/auth/otp`, `POST /v1/auth/otp/verify`
- `POST /v1/webhooks/payments` — signed external Payment Service webhook target
- `GET /v1/leaderboards/:gameId`
- `GET /v1/challenges`, `GET /v1/tournaments`
- `POST /v1/events` for opted-in, allow-listed de-identified events

Legacy direct JazzCash callback/return routes may remain implemented for unrelated compatibility paths. They are not the current Game Arena+ subscription integration.

## Authenticated player

- `GET /v1/session`
- `POST /v1/auth/logout`, `POST /v1/auth/logout-all`
- `GET /v1/account/sessions`, `DELETE /v1/account/sessions/:id`
- `GET /v1/account/export`, `DELETE /v1/account`
- `GET /v1/entitlements/me`

### Game Arena+ billing BFF

- `GET /v1/billing/plans`
- `POST /v1/billing/wallets/link`
- `GET /v1/billing/wallets`
- `POST /v1/billing/wallets/unlink`
- `GET /v1/billing/status`
- `POST /v1/billing/subscriptions`
- `POST /v1/billing/subscriptions/:id/cancel`
- `GET /v1/billing/payments`
- `GET /v1/billing/payments/:id`

The Game Arena API derives the Payment Service `userId` from the authenticated session. The browser never sends an authoritative charge amount or receives the Payment Service API key/webhook secret.

Other authenticated routes include:

- `GET /v1/wallet`
- `POST /v1/play-sessions`, `POST /v1/play-sessions/:id/complete`
- `POST /v1/challenges/:id/claim`
- `POST /v1/tournaments/:id/join`

State-changing browser requests require the session cookie, `x-csrf-token` and an approved `Origin`. Applicable payment/top-up mutations also preserve their idempotency rules.

## Administrative

Administrative routes use the server-enforced signed identity/role/capability boundary.

Representative routes include:

- `GET /v1/admin/metrics`, `GET /v1/admin/audit`
- `GET /v1/admin/users`
- payment/subscription/reporting/reconciliation routes under `/v1/admin`
- `GET /v1/admin/games`, `PATCH /v1/admin/games/:id`, `POST /v1/admin/games/:id/state`
- `GET /v1/admin/reviews`
- audited coin/subscription adjustments under the approved capability model

See `docs/SUBSCRIPTION-REPORTING.md` for reporting/admin details.

## Payment authority model

Current Game Arena+ architecture:

`Browser → Game Arena API/BFF → external Payment Service → JazzCash → Payment Service webhook → Game Arena API/PostgreSQL → entitlement`

- plan catalogue/amounts are server-authoritative through the Payment Service;
- browser return/navigation state never grants Premium;
- signed webhooks/status reconciliation drive authoritative entitlement changes;
- provider secrets remain server-side.

See `docs/PAYMENT-SERVICE-INTEGRATION.md`.

## Error and authority model

Errors use the repository's structured JSON error contract.

The server is authoritative for sessions, payment/subscription status, entitlements, game availability, scores, competition eligibility and Arena Coins. Browser redirects and game messages never grant Premium or ledger value directly.