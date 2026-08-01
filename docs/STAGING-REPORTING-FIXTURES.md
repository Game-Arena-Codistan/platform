# Game Arena+ staging reporting fixtures

Use only non-production identities and mock JazzCash for this fixture set. Report boundaries use `Asia/Karachi`; fixture timestamps should be stored as UTC.

## Required fixture matrix

| Fixture | Expected reporting behavior |
|---|---|
| Successful monthly activation | One completed payment, one paid activation, one active paid period, PKR 299 gross |
| Failed monthly activation | One failed attempt, no collections, no paid period |
| Pending yearly activation | One pending attempt, no collections, no paid period |
| Successful monthly extension | One completed extension; customer qualifies as recurring after the first completed extension |
| Failed yearly extension | One failed extension and renewal-rate denominator entry |
| Audited manual grant | Active period with `manual_grant` origin; excluded from paid activations and collections |
| Audited manual extension | Extended period with manual origin; excluded from successful paid extensions |
| Audited revoke | Cancelled history plus current free entitlement |
| Refund | Gross remains tied to paid timestamp, refund appears at refund timestamp, net reflects both for a range containing both |
| Member top-up discount | List price, charged price and redeemed discount value recorded |
| Refunded discounted top-up | Discount benefit is reversed and net benefit cost becomes zero |
| Duplicate provider event | No duplicate collections or entitlement period |
| Provider/internal mismatch | Open reconciliation case with safe statuses and references |
| Paid payment without entitlement | Derived reconciliation exception |
| Entitlement without paid payment | Derived exception unless the period is an audited manual grant |
| Stale pending payment | Reconciliation exception after the approved 24-hour threshold |

## Acceptance script

For one selected Pakistan-local date range:

1. Capture the summary JSON and each ledger page.
2. Export summary, payments, subscriptions, recurring customers, reconciliation and benefit costs.
3. Verify summary gross, refund and net values are reproducible from the payment export.
4. Verify daily/monthly buckets reconcile with summary totals.
5. Verify the recurring-customer count includes only customers with a completed paid extension.
6. Verify auto-renew remains a separate zero/disabled segment in single-charge mode.
7. Verify MRR and ARR return `not_applicable`, never monthly cash.
8. Verify manual grants and extensions are visible but excluded from paid metrics.
9. Verify support can view reports but cannot export or execute reconciliation.
10. Verify finance can export and each export creates an audit event with row count, schema version and content hash.
11. Verify no API or CSV contains hosted checkout fields, merchant credentials, secure hashes, raw provider payloads, OTPs or unrestricted customer identity.
12. Verify ranges over 366 days and exports over 10,000 rows fail with narrowing instructions.

Attach only non-sensitive summaries and content hashes to #48. Never attach credentials, raw provider payloads or customer data.
