# Game Arena external Payment Service integration

Parent: #158

## Current status

The external Payment Service integration is implemented, merged and deployed to staging. Repository implementation slices #159–#164 are complete.

Current payment release state: **READY FOR STAGING UAT**.

It is not yet `STAGING UAT PASSED` because real provider-backed staging credentials/endpoint and sandbox wallet flow are external inputs tracked under #165/#166.

## Authoritative architecture

Game Arena+ subscription billing uses:

`Browser → Game Arena API/BFF → external Payment Service → JazzCash → Payment Service webhook → Game Arena API/PostgreSQL → entitlement`

This is the current Premium architecture.

Direct browser-to-Payment-Service or browser-to-JazzCash API calls are not allowed. The browser never receives the product `X-Api-Key`, webhook shared secret or provider credentials.

The Game Arena API derives `userId` only from the authenticated Game Arena session.

## Server-side BFF routes

| Game Arena API | Payment Service |
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

The first successful wallet link may automatically create the first trial/subscription on the Payment Service. Game Arena therefore reconciles authoritative status instead of blindly issuing a second create call.

`POST /v1/billing/subscriptions` is for a linked wallet that has no open subscription, such as a valid resubscribe case after cancel/expiry/failure.

## Pricing

The Payment Service product catalogue is authoritative whenever external billing is enabled.

Game Arena renders plan values returned by `GET /v1/plans` through the BFF and sends `planCode`, never an arbitrary amount.

Before real staging UAT, confirm the Payment Service product contains the approved Game Arena monthly/yearly plans and prices.

## Entitlement mapping

- `trialing`: Premium active through authoritative `trial_ends_at`.
- `active` + paid/current period: Premium active through `current_period_end`.
- `initiated`: pending; no browser-side activation.
- `past_due`: preserve only already-paid access still supported by authoritative state.
- `canceled`: no future renewal; retain already-paid period through its authoritative end.
- wallet `unlinked`: stop future debits; preserve only authoritative paid-period access.
- `payment_failed` / `expired`: no new access.
- refund events: trigger authoritative reconciliation; do not infer outcome from browser state.

## Webhook safety

`POST /v1/webhooks/payments`:

1. reads the exact raw request body;
2. verifies HMAC-SHA256 with `PAYMENT_SERVICE_WEBHOOK_SECRET` using constant-time comparison;
3. validates the event header/type relationship;
4. validates supported event type and UUID `eventId`;
5. deduplicates by `eventId`;
6. allows safe retry if an earlier delivery was recorded but reconciliation did not complete;
7. fetches authoritative Payment Service status before changing entitlement;
8. records only non-sensitive audit evidence.

Browser redirects are never entitlement authority.

## Staging environment variables

Set on the **Game Arena API/server only**:

```text
PAYMENT_SERVICE_MODE=external
PAYMENT_SERVICE_URL=https://<payment-service-staging-host>
PAYMENT_SERVICE_API_KEY=<server-only-product-api-key>
PAYMENT_SERVICE_WEBHOOK_SECRET=<server-only-shared-secret>
PAYMENT_SERVICE_APP_RETURN_URL=https://gsmarena-play.codistan.org/#/premium
PAYMENT_SERVICE_TIMEOUT_MS=8000
```

Do not expose these through the web container, browser runtime config, source control, screenshots, logs or demo video.

The Payment Service product configuration must register:

```text
webhook_url = https://gsmarena-play.codistan.org/api/v1/webhooks/payments
app return origin = https://gsmarena-play.codistan.org
```

No AWS role, S3 bucket or EKS setup is required for this integration or for the current local-server deployment.

## Legacy/direct JazzCash boundary

The repository still contains direct JazzCash code/settings for legacy/non-subscription compatibility and existing unrelated payment/top-up behavior.

That code is **not the current Game Arena+ subscription path**. Do not migrate Premium back to direct JazzCash merely because those adapters/config values still exist.

## External inputs still required for real staging UAT

- actual Payment Service staging base URL;
- Game Arena product API key;
- matching webhook shared secret and registration;
- approved Game Arena monthly/yearly plan catalogue/prices;
- staging/sandbox JazzCash wallet/MSISDN test identity or supported provider flow, if required.

Do not put any secret value into GitHub issues or repository files.

## Real staging UAT

Tracked under #165.

1. Sign in.
2. Select monthly plan.
3. Enter supported MSISDN and consent.
4. Complete wallet linking through the provider/JazzCash hosted flow.
5. Return to Game Arena and confirm first trial/subscription appears without duplicate create.
6. Confirm authoritative Premium entitlement enables expected Premium access.
7. Confirm Account subscription state and payment history.
8. Cancel; verify future renewal stops and paid-period access follows authoritative policy.
9. Unlink; verify future debits stop.
10. Exercise failed/past-due behavior supported by staging.
11. Replay/retry a webhook and prove idempotency.
12. Repeat for yearly plan.
13. Check desktop and mobile.
14. Verify no secrets/tokens/MPIN values appear in browser-visible output, screenshots or logs.

Only actual provider-backed evidence may advance #166 to `STAGING UAT PASSED`.

## Stakeholder demo

After real staging UAT passes, record a concise demo showing:

- login;
- plan catalogue;
- MSISDN/consent;
- hosted wallet/payment handoff without exposing credentials;
- authoritative activation/trial state;
- Premium access;
- account plan/payment history;
- cancel/unlink;
- one safe failure/recovery state where sandbox supports it;
- mobile/responsive behavior.

Do not perform real-money production transactions without separate explicit production authorization.