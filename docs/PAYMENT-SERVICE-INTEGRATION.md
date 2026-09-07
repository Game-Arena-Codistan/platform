# Game Arena external payment-service integration

Parent: #158

## Architecture decision

Game Arena+ wallet subscriptions use this trust boundary when `PAYMENT_SERVICE_MODE=external`:

`Browser -> Game Arena API/BFF -> Payment Service -> JazzCash`

Payment-service webhooks return only to the Game Arena API, which reconciles authoritative status into Game Arena's PostgreSQL-backed entitlement state.

The browser never receives the product `X-Api-Key` or webhook shared secret and never supplies the application `userId`. The API derives `userId` from the existing authenticated Game Arena session.

The existing direct JazzCash adapter remains only for legacy/non-subscription paths while migration is being qualified. It is not used by the external Game Arena+ wallet-subscription BFF routes.

## Repository gap analysis

### Reused

- Cookie-session authentication and CSRF/origin checks.
- Modular-monolith API/BFF boundary.
- Normalized PostgreSQL runtime, entitlement history, payment-event idempotency and audit records.
- Existing Premium/account visual system and responsive shell.
- Docker Compose staging/local-server deployment lane.
- Node test suite, web checks and Playwright staging qualification.

### Modified

- Premium plan UX now prefers the payment-service plan catalog and sends `planCode`, never amount.
- Premium activation moves from direct JazzCash checkout to wallet link + authoritative status/webhook reconciliation.
- Account gains wallet/subscription/payment-history/cancel/unlink controls.
- Entitlements now understand trialing and automatic external subscription periods while the external mode is enabled.

### Added

- Server-only `PaymentServiceClient` with `X-Api-Key` authentication, timeout handling and upstream error mapping.
- BFF routes for plans, wallet link/status/unlink, subscription create/cancel, billing status and payment history/detail.
- Raw-body `X-Payment-Signature` webhook verification, `X-Payment-Event` validation and `eventId` idempotency.
- Authoritative status reconciliation so browser returns cannot activate Premium.
- Local-server environment placeholders and deterministic integration tests.

## BFF routes

| Game Arena API | Payment service |
|---|---|
| `GET /v1/billing/plans` | `GET /v1/plans` |
| `POST /v1/billing/wallets/link` | `POST /v1/wallets/link` |
| `GET /v1/billing/wallets` | `GET /v1/wallets/:userId` |
| `POST /v1/billing/wallets/unlink` | `POST /v1/wallets/unlink` |
| `GET /v1/billing/status` | `GET /v1/users/:userId/status` |
| `POST /v1/billing/subscriptions` | `POST /v1/subscriptions` |
| `POST /v1/billing/subscriptions/:id/cancel` | `POST /v1/subscriptions/:id/cancel` |
| `GET /v1/billing/payments` | `GET /v1/users/:userId/payments` |
| `GET /v1/billing/payments/:id` | `GET /v1/payments/:id` |
| `POST /v1/webhooks/payments` | product webhook target |

`POST /v1/billing/subscriptions` is not called after a successful first wallet link. The payment service creates the first trial/subscription automatically; the UI polls authoritative status instead. The create route exists for a linked wallet with no open subscription, such as resubscribe after cancel/expiry/payment failure.

## Pricing

The previous Game Arena frontend hard-coded monthly PKR 299 and yearly PKR 4,999. The supplied payment-service integration document shows a demo/product catalog with monthly PKR 599 and yearly PKR 4,999, but also states that pricing is server-authoritative and product-specific.

Therefore this integration does **not** hard-code a new charge amount. When external mode is active, the UI renders the values returned by `GET /v1/plans`; it never sends an amount. Before staging UAT, the Game Arena product catalog in the payment service must be reviewed/upserted with the approved Game Arena prices and plan codes.

## Entitlement mapping

- `trialing`: Premium is active through `trial_ends_at`.
- `active` + `current_period_paid`: Premium is active through `current_period_end`.
- `initiated`: first charge pending; no browser-side self-activation.
- `past_due`: retain access only when an already-paid current period remains authoritative; otherwise no paid access is invented. Dunning is owned by the payment service.
- `canceled` / wallet `unlinked`: future debits stop; already-paid access is preserved through the known paid period.
- `payment_failed` / `expired`: no new access is granted; an already-paid unexpired period is preserved if authoritative state still supports it.
- `payment.refunded`: webhook triggers authoritative status reconciliation; Game Arena does not infer a refund entitlement outcome from browser state.

Full and step-charge success are both represented by the payment service as an active paid period and therefore grant the same Game Arena+ access.

## Webhook safety

`POST /v1/webhooks/payments`:

1. reads the exact raw request body;
2. verifies `HMAC-SHA256(PAYMENT_SERVICE_WEBHOOK_SECRET, rawBody)` against `X-Payment-Signature` using constant-time comparison;
3. requires `X-Payment-Event` to equal the body `type`;
4. validates a UUID `eventId` and supported event type;
5. deduplicates by `eventId`;
6. retries reconciliation if a prior delivery was recorded but not fully processed;
7. fetches authoritative payment-service status before changing Game Arena entitlement;
8. records non-sensitive audit evidence.

A browser return URL is never an entitlement authority.

## Environment variables

Set on the **Game Arena API container/server only**:

```text
PAYMENT_SERVICE_MODE=external
PAYMENT_SERVICE_URL=https://<payment-host>
PAYMENT_SERVICE_API_KEY=<product-api-key>
PAYMENT_SERVICE_WEBHOOK_SECRET=<shared-webhook-secret>
PAYMENT_SERVICE_APP_RETURN_URL=https://gsmarena-play.codistan.org/#/premium
PAYMENT_SERVICE_TIMEOUT_MS=8000
```

Do not expose these through the web container, runtime browser config, source control or logs. `PAYMENT_SERVICE_MODE=disabled` preserves the current certified behavior until the staging values are supplied.

The payment-service product configuration must set:

```text
webhook_url = https://gsmarena-play.codistan.org/api/v1/webhooks/payments
app return origin = https://gsmarena-play.codistan.org
```

Adjust the hostname only if the actual staging domain changes. No AWS role, S3 or EKS configuration is required for this local-server payment integration.

## Remaining external inputs for real staging UAT

- Staging payment-service base URL.
- Game Arena product API key.
- Matching Game Arena product webhook shared secret and webhook registration.
- Approved Game Arena plan catalog/prices in the payment service.
- JazzCash/payment-service staging or sandbox wallet test identity/flow, if required by that environment.

No value above should be pasted into GitHub issues or committed to the repository.

## Staging UAT

Use #165 and prove the actual deployed chain:

1. Sign in.
2. Select monthly plan.
3. Enter MSISDN and consent to automatic billing.
4. Complete wallet linking on the JazzCash-hosted page.
5. Return to Game Arena; confirm first trial/subscription appears without a second create call.
6. Confirm trial or paid entitlement enables Premium gameplay.
7. Confirm account subscription state and payment history.
8. Cancel subscription and verify future renewal stops while paid-period access is retained.
9. Unlink wallet and verify future debits stop.
10. Exercise failed/past-due behavior supported by staging.
11. Replay a webhook and prove idempotency.
12. Repeat for yearly plan.
13. Check desktop and mobile.

Do not perform real-money production transactions without separate explicit authorization.

## Stakeholder demo checklist

Record a short demo after staging UAT passes:

- Premium plan picker with approved monthly/yearly pricing.
- JazzCash mobile-number + consent screen.
- Handoff to the JazzCash-hosted wallet page (do not expose credentials or MPIN in recording).
- Return to Game Arena and authoritative activation/trial state.
- Premium game access.
- Account plan/status/paid-through information and payment history.
- Cancel subscription and explain paid-period retention.
- Unlink wallet and explain that all future debits stop.
- One safe failure/past-due recovery state if the sandbox supports it.
