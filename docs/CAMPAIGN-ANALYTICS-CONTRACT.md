# Campaign analytics v1 — implementation contract (#192/#193)
Status: engineering proposal, not business/provider approval. Source: uploaded Campaign Tracking & Analytics specification, sections 1–7. Existing console and Payment Service remain authoritative boundaries. No production changes.

## Attribution and event contract
Campaign config: campaign_id, landing_page, platform, utm_source, utm_campaign, utm_medium, utm_content, utm_term, package, parameter, referral, plan_id, creative_id, active. Legacy utm=M/T/S/G/D maps Meta/TikTok/Snapchat/Google/direct; retain unknown labels rather than silently relabel direct. Explicit legacy utm wins when both are supplied; preserve standard fields. Validate canonical plan and actual amount on backend. Never use URL price. Only allowlisted safe path and fields, no raw query containing phone/token.
Server attribution: attribution_id, anonymous_id, user_id nullable, first_seen_at, expires_at, consent state, campaign snapshot, landing path. Proposed first-touch 30 days, no overwrite before expiry; user login links server identity, not browser-supplied user ID. Direct visits do not overwrite an active attributed session. Final overwrite/consent policy requires owner approval.
Funnel event: event_id, type, occurred_at, attribution_id, anonymous/session/user ID, order/attempt ID, platform, plan, parameter, safe metadata, idempotency key. Allowlisted stages: landing_view, landing_cta, subscribe, begin_checkout, jazzcash_initiated, paywall_view, mpin_shown, mpin_submitted, payment_succeeded, payment_failed, payment_cancelled. Provider stages only when observed from a documented contract. Backend log independent from GA4.
Payment: provider order/attempt/transaction IDs, user, plan, attribution snapshot, actual minor amount/currency, verified status, stage timestamps, failure code/reason. Unique successful transaction key; repeat callbacks do not increment Subs. Correlation must be explicit, not guessed from user/time. Signed webhook and/or authoritative server-side status; never trust URL success. No raw MPIN, full phone, provider secrets or arbitrary metadata in reports.

## Reporting decisions
Business timezone Asia/Karachi. Range inclusive local start, exclusive next-day end. Subs count unique captured paid membership transactions; no pending/failed/manual grants. Current historical finance report includes previously captured/refunded transactions in gross; retain that existing behavior until owner approves refund treatment. Expose refund and extension separately; proposed campaign default is gross captured count with explicit refunds, not net subscriptions. Renewal/trial/introductory charge classification requires product owner decision; don't silently classify as full paid activation. Actual provider amount only, not advertised price. Independent platform/package/parameter views reconcile to the same count; do not sum them. Direct, unknown and missing labels visible. Revenue aggregation must not double count. GA4 is marketing only, consent gated; ecommerce purchase uses verified transaction_id, value, currency and items.

## Provider/product questions still open
- HE/NON HE: classification and source; show unavailable until supplied.
- MPIN shown/submitted: available events, attempt keys; unavailable is not zero.
- Provider attempt vs order, failure mappings, payment/refund/renewal/trial policy and correlation fields: confirm with Payment Service.
- GA4 property/custom dimensions and consent policy: owner setup.
- Email time, approved recipient and test delivery: owner setup.
- Canonical parameter taxonomy and first-touch rule: confirm.
Do not invent provider payload fields, emit synthetic production events, or close #193 until decisions and evidence are accepted.

## Acceptance fixtures
Tagged legacy and standard links; direct, unknown, expired, changed source; signup and same attribution across checkout; malformed package; one signed verified payment, duplicate callback, failed retry, separate renewal/refund; midnight PKT boundary; GA4 denied/blocked; authorized vs unauthorized export; multi-dimension totals and native XLSX layouts; previous-day email idempotency and restart.
