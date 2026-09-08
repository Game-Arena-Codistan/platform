# Payments and Premium entitlements

## Current Game Arena+ payment architecture

Game Arena+ subscriptions use the external Payment Service as the provider boundary:

`Browser → Game Arena API/BFF → external Payment Service → JazzCash → Payment Service webhook → Game Arena API/PostgreSQL → entitlement`

The browser never calls the Payment Service directly, never receives its product API key/webhook secret and never supplies the authoritative Game Arena `userId` or charge amount.

The Game Arena API derives user identity from the authenticated session and sends only approved plan codes/product requests to the Payment Service.

## Pricing and plans

When `PAYMENT_SERVICE_MODE=external`, the Payment Service plan catalogue is authoritative for:

- plan code;
- monthly/yearly availability;
- amount;
- currency;
- trial/period data exposed by the provider contract.

Do not hard-code or forward an arbitrary payment amount from the browser.

## Subscription flow

1. User signs in to Game Arena.
2. Game Arena fetches plan catalogue through its BFF.
3. User selects a plan and provides the supported JazzCash MSISDN/consent.
4. Game Arena BFF starts wallet linking through the Payment Service.
5. Browser follows the provider-hosted/JazzCash handoff.
6. Browser returns to Game Arena only as navigation state; the redirect is not entitlement authority.
7. Game Arena reconciles authoritative wallet/subscription status through the Payment Service.
8. Signed Payment Service webhooks trigger authoritative status reconciliation.
9. Game Arena persists the resulting entitlement state in PostgreSQL.

A successful first wallet link may create the first trial/subscription on the Payment Service side. Game Arena must not create a duplicate subscription merely because the browser returned successfully.

## Entitlement rules

- `trialing`: Premium active through authoritative trial end.
- `active` with paid/current period: Premium active through authoritative period end.
- `initiated`/pending: no invented paid access.
- `past_due`: preserve only already-paid unexpired access supported by authoritative state.
- `canceled`: stop future renewal; retain already-paid access through the known paid period.
- wallet `unlinked`: stop future debits; preserve only authoritative already-paid access.
- `payment_failed` / `expired`: no new access is invented.
- refund events trigger authoritative reconciliation; browser state never decides refund entitlement.

## Webhook safety

The Game Arena webhook endpoint is:

`POST /api/v1/webhooks/payments`

Public staging target:

`https://gsmarena-play.codistan.org/api/v1/webhooks/payments`

The handler must:

- verify HMAC-SHA256 over the exact raw request body using the server-only shared secret;
- require the event header/type to match the body;
- validate supported event type and event ID;
- deduplicate/retry safely by `eventId`;
- fetch authoritative Payment Service status before changing entitlement;
- avoid logging secrets or sensitive provider payloads.

## Staging configuration

Configure on the API/server only:

```text
PAYMENT_SERVICE_MODE=external
PAYMENT_SERVICE_URL=...
PAYMENT_SERVICE_API_KEY=...
PAYMENT_SERVICE_WEBHOOK_SECRET=...
PAYMENT_SERVICE_APP_RETURN_URL=https://gsmarena-play.codistan.org/#/premium
PAYMENT_SERVICE_TIMEOUT_MS=8000
```

Keep `PAYMENT_SERVICE_MODE=disabled` until the real staging provider values are installed.

## Legacy/direct JazzCash code

Direct JazzCash code/settings remain only for legacy/non-subscription compatibility such as unrelated existing payment/top-up paths.

They are **not the current Game Arena+ subscription architecture** and must not be reintroduced into the player-facing Premium flow while external billing is enabled.

## Staging UAT required before production approval

Real provider-backed staging UAT must prove:

- monthly flow;
- yearly flow;
- wallet link;
- first subscription/trial without duplicate create;
- Premium entitlement activation;
- payment history/account status;
- cancel;
- unlink;
- failed/past-due state where supported;
- duplicate/retried webhook behavior;
- desktop/mobile;
- no API key, webhook secret, MPIN or token leakage.

Tracked under #158/#165/#166.

If real charging is required for production, live provider/finance settlement/refund/reconciliation readiness remains tracked under #17.

Production payment activation always requires separate explicit approval.