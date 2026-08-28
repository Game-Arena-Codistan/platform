# Payments and Premium Entitlements

The frontend initiates a hosted JazzCash checkout and displays pending, success, failure, cancellation and retry states. It never collects a wallet PIN or full card details.

The backend must generate signed checkout requests, verify callbacks and webhooks, store idempotent payment events and reconcile provider records. Redirect parameters alone never grant access.

Game Arena+ access is derived from a separate entitlement service. Monthly, yearly and fixed-duration passes are supported so the product can adapt to the merchant capabilities confirmed by JazzCash.

## Staging provider configuration

EC2 Compose staging defaults to `JAZZCASH_MODE=mock`. To exercise the hosted JazzCash sandbox/merchant flow, configure these values in the protected staging runtime environment and redeploy the exact SHA:

- `JAZZCASH_MODE` — any explicitly approved non-`mock`, non-`disabled` provider mode used for the merchant environment;
- `JAZZCASH_MERCHANT_ID`;
- `JAZZCASH_PASSWORD`;
- `JAZZCASH_INTEGRITY_SALT`;
- `JAZZCASH_ACTION_URL`;
- `JAZZCASH_RETURN_URL`;
- `JAZZCASH_WEBHOOK_SECRET` when the integration uses the signed notification fallback.

Do not commit merchant credentials. Keep them in the approved staging/production secret store. Production charging remains gated on the provider, settlement and reconciliation evidence tracked by the JazzCash launch gate.
