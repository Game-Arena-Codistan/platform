# Game Arena+ staging reporting fixtures

## Current payment-model note

The current Premium architecture uses the external Payment Service, not direct player-facing JazzCash checkout.

`Browser → Game Arena API/BFF → external Payment Service → JazzCash → Payment Service webhook → Game Arena API/PostgreSQL → entitlement`

Use deterministic/mock fixtures for repository tests and real Payment Service sandbox/staging state for provider UAT. Do not use production identities or real-money production transactions for staging fixtures.

Report boundaries use `Asia/Karachi`; persisted timestamps remain UTC.

## Required fixture matrix

| Fixture | Expected reporting behavior |
|---|---|
| Trialing monthly subscription | Trial/subscription state visible; no invented completed collection unless provider state includes one |
| Successful monthly paid period | One authoritative completed payment/paid period and matching entitlement |
| Failed monthly payment | Failed attempt/state, no invented new paid access |
| Pending/initiated yearly flow | Pending state, no invented completed collection |
| Successful renewal/next paid period | Completed renewal/period recorded distinctly from initial activation |
| Failed/past-due renewal | Failure/past-due state represented without inventing paid access; preserve already-paid period only where authoritative |
| Cancellation | Future renewal stopped; already-paid access retained through authoritative paid-period end |
| Wallet unlink | Future debit link removed; entitlement follows authoritative paid-period state |
| Audited manual grant | Manual origin remains distinct from provider-paid/trial access and excluded from collections |
| Audited manual revoke/adjustment | History/audit reflects the operation without rewriting provider events |
| Refund/reversal | Provider refund/reversal reconciles with payment/entitlement reporting according to authoritative state |
| Member top-up discount | List price, charged price and benefit value recorded for the legacy/top-up product path where applicable |
| Duplicate Payment Service event | No duplicate collection/subscription/entitlement effect |
| Retry after incomplete webhook reconciliation | Event can complete safely without duplicate effects |
| Provider/Game Arena mismatch | Reconciliation case/attention state with safe references |
| Paid/provider-active without entitlement | Reconciliation exception |
| Entitlement without authoritative provider/manual source | Reconciliation exception |
| Stale pending/initiation state | Reconciliation/attention state after approved threshold |

## Acceptance script

For one selected Pakistan-local date range:

1. Capture summary/ledger results for the supported report set.
2. Verify provider-derived payment/subscription state reconciles to Game Arena entitlement for identical filters.
3. Verify initial activation/trial, paid periods and completed renewals are distinguishable.
4. Verify failed/past-due/canceled/unlinked states follow authoritative entitlement rules.
5. Verify manual grants/adjustments remain separate from provider collections.
6. Verify duplicate/retried webhook events do not duplicate collections or entitlement periods.
7. Verify report viewers/exporters/reconciliation operators remain capability-separated.
8. Verify CSV/export formulas and totals match backend report definitions.
9. Verify no API/export contains Payment Service API keys, webhook secrets, wallet MPINs, raw secret-bearing payloads, OTPs, session tokens or unrestricted identity.
10. Verify bounded ranges/page/export limits continue to fail closed.

## Recurring metric rule

Do not assume MRR/ARR or a recurring-customer definition merely because external subscriptions support wallet consent/renewal semantics. Those metrics become authoritative only when provider behavior, persisted renewal evidence and finance definitions are approved.

Until then, keep collections, initial activations/trials and completed renewals/periods explicit rather than relabeling them.

Attach only non-sensitive summaries/content hashes/references to #48/#165/#166. Never attach provider credentials, raw secret-bearing payloads or customer data.