# Game Arena+ administration and reporting

## Current product/payment boundary

Game Arena+ Premium subscriptions now integrate through the external Payment Service:

`Browser → Game Arena API/BFF → external Payment Service → JazzCash → Payment Service webhook → Game Arena API/PostgreSQL → entitlement`

When external billing is enabled, the Payment Service product catalogue and authoritative subscription/status responses determine the active plan, price/currency and period/trial state. The browser never supplies an authoritative amount.

The historical fixed-duration direct JazzCash model remains relevant only to legacy records/compatibility paths. Reporting must not confuse those historical transactions with the current external subscription flow.

Report timestamps are stored in UTC and grouped using `Asia/Karachi` boundaries where the report contract requires local calendar grouping.

## Revenue-metric caution

Do not automatically label consent, a linked wallet or a single activation as recurring revenue.

MRR/ARR or recurring-customer metrics are authoritative only when:

- the Payment Service/provider recurring model is approved for the launch product;
- real provider-backed staging UAT has passed;
- renewal/payment events and billing-period snapshots are persisted in a way that supports the metric definition;
- finance approves the definition.

Until those conditions are met, reports should keep collections, activations, trialing/active periods and completed renewals distinguishable and avoid inventing recurring metrics.

## Authority model

Only authoritative backend/provider state may complete a payment/subscription transition or grant Premium. Browser returns remain observational.

The Game Arena API stores only the information needed for product state, reporting, reconciliation and audit. Product API keys, webhook secrets, wallet MPINs, raw secret-bearing provider payloads and unrestricted payment-account data must never be exposed through reporting APIs.

Administrators receive server-provided capabilities such as:

- `subscription.read`
- `subscription.manage_plans`
- `subscription.adjust`
- `reconciliation.execute`
- `reports.read`
- `reports.export`

Report export remains separate from report viewing.

## Report endpoints

Administrative/reporting endpoints remain under the server-enforced `/v1/admin` authorization boundary, including plan/subscription ledgers, payment reports, reconciliation, benefit-cost and export routes implemented by the application.

## Filters and pagination

Preserve bounded date ranges, stable ordering, server pagination and explicit timezone/effective-range metadata. Do not load unrestricted finance/payment history into the browser.

Applicable filters may include:

- date preset/custom range;
- plan or plan version/code;
- payment purpose/status;
- subscription status;
- wallet/renewal state only when authoritative;
- customer search under approved capability;
- cursor/limit.

## Metric definitions

Reports must distinguish at minimum:

- gross completed Game Arena+ collections;
- authoritative refunds/reversals;
- net collections;
- new activation/trial versus completed renewal/extension where provider state proves it;
- active/trialing/past-due/canceled/expired periods where supported;
- manual/audited grants versus paid/provider-derived access;
- member benefit/discount value only where an approved monetary value exists.

A wallet link or auto-pay consent alone is not a completed renewal.

## Payment and plan snapshots

Game Arena should retain sufficient immutable plan/payment/subscription snapshots to explain historical entitlement and finance outcomes even if the current Payment Service catalogue changes later.

Historical direct-JazzCash/fixed-duration records must remain understandable and must not be silently rewritten into the new subscription model.

## Reconciliation

Reconciliation is read-first and server-authoritative. It should surface discrepancies such as:

- authoritative provider success without matching Game Arena entitlement;
- entitlement without authoritative paid/trial state except approved manual grant;
- amount/currency/plan/status mismatch;
- duplicate/retried/failed webhook processing;
- stale pending/initiation state;
- refund not reflected in entitlement;
- cancellation/unlink state not reflected correctly.

Any mutation to resolve a case requires the appropriate capability, explicit reason, idempotency and audit evidence.

## CSV/export safety

Exports must use the same backend filters/formulas as the on-screen report, use bounded ranges/rows, protect against spreadsheet formula injection and record non-sensitive export audit metadata.

Never export secrets, raw webhook payloads, MPINs, full provider credentials or unrestricted PII.

## Staging acceptance

Before paid production launch, real external Payment Service staging UAT (#165/#166) and human Admin/reporting UAT must confirm that provider subscription/payment state reconciles with Game Arena entitlement and reporting for the exact final staging SHA.

If real charging is part of production launch, #17 remains the provider/finance readiness gate for live settlement/reconciliation/refund/dispute evidence.

Production remains separately authorized.