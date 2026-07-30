# Payments and Premium Entitlements

The frontend initiates a hosted JazzCash checkout and displays pending, success, failure, cancellation and retry states. It never collects a wallet PIN or full card details.

The backend must generate signed checkout requests, verify callbacks and webhooks, store idempotent payment events and reconcile provider records. Redirect parameters alone never grant access.

Game Arena+ access is derived from a separate entitlement service. Monthly, yearly and fixed-duration passes are supported so the product can adapt to the merchant capabilities confirmed by JazzCash.
