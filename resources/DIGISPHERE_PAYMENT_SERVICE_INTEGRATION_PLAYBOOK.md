# Digisphere / Codistan Payment Service — Integration Playbook

**Audience:** Cursor agents (and engineers) integrating Digisphere JazzCash wallet-link + recurring billing into a **product BFF + SPA**, the same way Maidan Premium was migrated.

**Payment service:** Digisphere `jazzcash-service` at `https://payments.codistan.org`  
**Reference implementation:** Maidan (`backend` + `web-mobile`) — Digisphere checkout, merchant callback bridge, webhooks, TikTok Subscribe after Digisphere return.

Use this file as the **source of truth** for a new project. Do not invent JazzCash client calls in the product frontend. Do not put `X-Api-Key` in Vite/`NEXT_PUBLIC_` / browser code.

---

## 0. Goal

Replace DIY JazzCash wallet-link + local renewals with:

1. Product app = **BFF** (session auth → payment service with server `X-Api-Key`)
2. Browser = JazzCash **hosted** Wallet Linking Portal only (MPIN there)
3. Digisphere = token storage, trial, recurring MWALLET charges, signed webhooks
4. Product = grant/revoke entitlements from webhooks + status reconcile
5. Analytics = fire conversion **Subscribe** after Digisphere success return (no JazzCash `order`/`cv`)

---

## 1. Non‑negotiable rules

1. **Never call Digisphere from the browser.** Only the product backend uses `X-Api-Key`.
2. **Never collect MPIN / OTP in the product UI.** Only JazzCash hosted portal.
3. **Never log or persist** `pp_Password`, `pp_SecureHash`, `pp_PaymentToken`, raw API keys, webhook secrets.
4. **UI must not send charge amounts.** Catalog lives on Digisphere `plans` (paisas = PKR × 100).
5. **Do not** call Digisphere `POST /v1/subscriptions` immediately after first-time wallet link success — trial/sub starts on JazzCash wallet-return inside Digisphere. That call is for **resubscribe after cancel** or `skipTrial`.
6. **One open subscription** per `(product, external_user_id)`.
7. Product `userId` sent to Digisphere **must** be the product’s stable account id (e.g. Mongo `_id`). BFF sets it from session / guest stub — never trust an arbitrary client-supplied id without binding it to the authenticated/stub user.
8. Disable product-side Premium renewal schedulers when Digisphere owns recurring (`ENABLE_PREMIUM_RENEWAL_SCHEDULER=false` or equivalent).

---

## 2. End‑to‑end target flow

```text
User → Product SPA (landing/checkout)
  → Product BFF POST …/wallets/link  (adds userId, planCode, appReturnUrl)
    → Digisphere POST /v1/wallets/link  (X-Api-Key)
      ← portalUrl + fields + requestId + returnUrl
  → SPA auto-POST form to JazzCash Wallet Linking Portal
  → User completes MPIN on JazzCash
  → JazzCash POST/GET to merchant ReturnURL
        (either Digisphere /v1/jazzcash/wallet-return
         OR product /callback with ?productId&userId — see §4)
  → Digisphere stores token, starts trial/sub, 302 → appReturnUrl
        ?wallet=linked&userId=…&subscriptionStatus=trialing&trialEndsAt=…
  → Digisphere webhooks → Product webhook URL (HMAC)
  → Product grants Premium / entitlement
  → SPA return page: fire Subscribe pixel + reconcile entitlement UI
```

---

## 3. Digisphere portal / ops setup (per product)

Create/configure product on Digisphere admin (`/v1/admin` or Products UI).

| Item | Action |
|---|---|
| Product `code` | Stable code (e.g. `maidan`, `bizb`) |
| `X-Api-Key` | Generate once; store only in product backend secrets |
| Webhook secret | Same value as product env `*_PAYMENT_WEBHOOK_SECRET` |
| Webhook URL | `https://{PRODUCT_API_HOST}/api/…/webhook/payment-service` (API host, **not** SPA apex) |
| JazzCash merchant | Product’s own `MC…` / password / integrity salt on the product row |
| Plans | `PUT /v1/plans` — codes + `fullAmountMinor` / `stepAmountMinor` (paisas) + `trialHours` |
| `WALLET_APP_RETURN_ORIGINS` | Include product SPA origins (staging + prod) |
| `JAZZCASH_WALLET_RETURN_OVERRIDES` | **Only if** JazzCash merchant allowlists the **product** callback domain (Maidan pattern). See §4. |

### Plan catalog must match product prices

Example (Maidan staging target):

| `code` | interval | `fullAmountMinor` | Display |
|---|---|---|---|
| `monthly` | monthly | `99000` | PKR 990 |
| `yearly` | yearly | `499900` | PKR 4,999 |

**Critical:** If product DB shows PKR 990 but Digisphere monthly is `59900`, entitlement reconcile will fail with **amount mismatch**. Keep Digisphere catalog and product plan prices in lockstep (paisas = rupees × 100).

Update live catalog (server-side only):

```http
PUT /v1/plans
X-Api-Key: pk_…
Content-Type: application/json

[
  {"code":"monthly","interval":"monthly","fullAmountMinor":99000,"stepAmountMinor":99000,"trialHours":24,"currency":"PKR"},
  {"code":"yearly","interval":"yearly","fullAmountMinor":499900,"stepAmountMinor":499900,"trialHours":24,"currency":"PKR"}
]
```

Existing Digisphere subscriptions keep **snapshotted** amounts. After a catalog price change, either reprice open subs (`PATCH /v1/subscriptions/:id` with `planCode`) or cancel/unlink and re-link for UAT.

---

## 4. JazzCash return URL strategies

### A. Default (Digisphere owns return)

`pp_ReturnURL` = `{PUBLIC_BASE_URL}/v1/jazzcash/wallet-return?productId=…&userId=…`  
JazzCash merchant must allowlist that Digisphere URL.

### B. Merchant callback bridge (Maidan pattern)

Some merchants can only allowlist the **product** domain (e.g. `https://api.{product}/callback`).

Digisphere env:

```bash
JAZZCASH_WALLET_RETURN_OVERRIDES={productCode}=https://api.{product-host}/callback
```

Then JazzCash posts to **product** `/callback?productId=…&userId=…`. Product must:

1. Detect Digisphere return (`productId` + `userId` present, or preferred checkout = digisphere).
2. Forward body/query as `application/x-www-form-urlencoded` to  
   `{PAYMENT_SERVICE_URL}/v1/jazzcash/wallet-return?productId=…&userId=…`  
   **without following redirects** (`maxRedirects: 0`).
3. Pass through Digisphere’s `302 Location` (appReturnUrl) to the browser.

**Do not** point override at SPA apex (`https://{spa}/callback`). Static nginx rejects JazzCash **POST** → **405**. Use the **API** host that runs the Express callback.

Staging vs prod overrides must not be mixed:

| Env | Override example |
|---|---|
| Staging UAT | `product=https://api.staging.example.com/callback` |
| Production | `product=https://api.example.com/callback` |

---

## 5. Product backend checklist (BFF)

### 5.1 Env (backend secrets only)

```bash
# Hard switch
PREMIUM_PREFERRED_CHECKOUT=digisphere   # or PROJECT_PREFERRED_CHECKOUT=digisphere

PAYMENT_SERVICE_URL=https://payments.codistan.org
# Maidan names: PREMIUM_PAYMENT_SERVICE_URL
PAYMENT_SERVICE_API_KEY=pk_…            # Digisphere product key
PAYMENT_WEBHOOK_SECRET=…                # must match portal

# Browser return after Digisphere wallet-return (allowlisted origin)
PAYMENT_APP_RETURN_URL=https://{spa}/premium/return
WALLET_APP_RETURN_ORIGINS=https://{spa},https://staging.{spa}

# Plan code mapping (Digisphere codes)
PAYMENT_PLAN_MONTHLY_CODE=monthly
PAYMENT_PLAN_YEARLY_CODE=yearly
PAYMENT_SERVICE_TIMEOUT_MS=20000

# Digisphere owns renewals
ENABLE_PREMIUM_RENEWAL_SCHEDULER=false

# If using merchant callback bridge:
# JazzCash allowlisted URL → product API /callback
JAZZCASH_WALLET_RETURN_URL=https://api.{host}/callback
```

CORS: include SPA origins. Ensure container **process** env actually has URL + API key (file on disk ≠ injected env). Recreate container after env changes. Verify:

```bash
docker exec {backend} printenv | grep -E 'PAYMENT_|PREMIUM_PREFERRED|CORS|PORT'
```

### 5.2 Digisphere HTTP client (server)

All calls:

```http
X-Api-Key: {PAYMENT_SERVICE_API_KEY}
Content-Type: application/json
```

| Product need | Digisphere API |
|---|---|
| Start wallet link | `POST /v1/wallets/link` `{ userId, msisdn, planCode?, appReturnUrl? }` |
| Status / poll | `GET /v1/users/:userId/status` |
| Plans | `GET /v1/plans` |
| Upsert plans (ops) | `PUT /v1/plans` |
| Unlink | `POST /v1/wallets/unlink` `{ userId }` |
| Cancel sub | `POST /v1/subscriptions/:id/cancel` |
| Resubscribe | `POST /v1/subscriptions` `{ userId, planCode, skipTrial? }` |
| Payments | `GET /v1/users/:userId/payments` |

`appReturnUrl` origin must be in Digisphere `WALLET_APP_RETURN_ORIGINS`. Path should be the product Premium return route (e.g. `/premium/return`).

### 5.3 Suggested product routes

| Product route | Behavior |
|---|---|
| `POST /api/…/billing/wallets/link` | Auth → Digisphere link; return `{ portalUrl, method, fields, requestId, returnUrl }` |
| `POST /api/…/billing/wallets/link-guest` | Optional pay-before-signup: find/create stub user by MSISDN → Digisphere link |
| `GET /api/…/billing/status` | Digisphere status + **reconcile local entitlement** |
| `POST /api/…/billing/wallets/unlink` | Digisphere unlink + local revoke policy |
| `POST /api/…/webhook/payment-service` | Raw body + HMAC verify + idempotent apply |
| `GET|POST /callback` | If bridge mode: forward to Digisphere wallet-return; pass through 302 |

MSISDN validate in Digisphere mode: format-only is OK; JazzCash account is confirmed on hosted page (`digisphere_deferred` pattern).

### 5.4 Callback bridge (if using §4B)

Pseudo-logic:

```
on /callback:
  if query/body has productId AND userId (or preferredCheckout=digisphere):
    forward form-urlencoded to PAYMENT_SERVICE_URL/v1/jazzcash/wallet-return?productId&userId
    if Digisphere returns 3xx with Location → redirect browser there
    else return Digisphere body / safe error
  else:
    legacy DIY JazzCash finalize (if still supported)
```

Mount `/callback` so JazzCash Origin is accepted (often **before** strict CORS). Nginx must allow **POST** to this path on the **API** vhost.

### 5.5 Webhooks

- Endpoint must receive **raw body** for HMAC.
- Header: `X-Payment-Signature` = HMAC-SHA256(webhook_secret, raw_body) hex.
- Header: `X-Payment-Event` must match payload `type`.
- Idempotent by Digisphere `eventId` (at-least-once delivery).

Handle at least:

| Event | Product action |
|---|---|
| `wallet.linked` / `subscription.created` | Grant trial entitlement (no money yet) |
| `subscription.activated` / `subscription.renewed` / `payment.completed` | Paid / renewed access |
| `subscription.past_due` / `payment_failed` / `expired` / `canceled` | Grace / revoke per product policy |
| `wallet.unlinked` | Stop auto-pay; cancel open Digisphere subs (service does this); apply local policy |

After webhook: upsert local subscription from Digisphere status (authoritative). Prefer also reconciling on `GET billing/status` so SPA does not wait only on webhook latency.

### 5.6 Entitlement reconcile

When syncing Digisphere subscription → local Premium:

- Map Digisphere `plan_code` (`monthly`/`yearly`) → local plan.
- Compare amounts in **paisas**: Digisphere `amount_minor` / catalog `fullAmountMinor` must equal `localPlan.price * 100`.
- Map Digisphere `trialing` → local entitled state (Maidan maps to local `active` with `entitledUntil = trialEndsAt`).
- Prefer open remote sub (`trialing|active|…`) over canceled history when multiple rows exist.

---

## 6. Product frontend checklist

### 6.1 Wallet link UX

1. Collect MSISDN + consent.
2. Call **product BFF** link (not Digisphere).
3. Auto-submit hosted form:

```js
const form = document.createElement('form')
form.method = 'POST'
form.action = link.portalUrl
for (const [name, value] of Object.entries(link.fields)) {
  const input = document.createElement('input')
  input.type = 'hidden'
  input.name = name
  input.value = value
  form.appendChild(input)
}
document.body.appendChild(form)
form.submit()
```

4. Persist pending state **without secrets**: `{ planId, startedAt, requestId, checkoutMode }` in `sessionStorage`.
5. On `409 already_linked` / `alreadySubscribed`: do not open portal; continue claim/signup or show subscribed UI.

### 6.2 Return URL handling (`/premium/return`)

Digisphere success looks like:

```text
/premium/return?wallet=linked&userId=…&subscriptionStatus=trialing&trialEndsAt=…
```

Failure: `wallet=failed`.

**Must do on return (signed-in):**

1. Capture conversion hints from query (see §7).
2. Call product `GET billing/status` (triggers Digisphere reconcile into local DB).
3. Refresh entitlement snapshot (`/premium/me` or equivalent).
4. Fire analytics **Subscribe** (§7).
5. Navigate to Premium unlocked / Profile — UI must read **server** entitlement after reconcile, not only a local unlock flag.

**Do not** rely on DIY JazzCash “token inquiry reconcile” alone for Digisphere — that path expects a pending DIY intent and will false-fail Digisphere returns. Always fall back to Digisphere `billing/status` reconcile.

### 6.3 Profile / account Premium badge

Display subscribed when:

- Local entitlement snapshot says premium **or**
- Digisphere billing status has `alreadySubscribed` / open `trialing|active|…` / wallet linked after reconcile

Refresh on Profile mount via `billing/status` + entitlement refresh (Maidan bug: Profile stayed “Not subscribed” until this was added).

---

## 7. TikTok / analytics Subscribe fix (required)

### Problem

Digisphere return has **no** JazzCash `order` / `txnRefNo` / signed `cv`.  
If Subscribe only fires when those exist, **Subscribe never fires** after Digisphere (Maidan staging bug).

### Fix pattern (port this)

1. On `wallets/link` success, store `requestId` in session pending state.
2. On return, parse query:
   - `wallet` / `payment`
   - `userId`, `subscriptionStatus`, `trialEndsAt`
   - optional `order` / `txnRefNo` / `requestId` / `cv`
3. Build conversion `orderId`:
   - prefer explicit order/txn/requestId from URL
   - else pending `requestId` from session
   - else synthesize `digisphere:{userId}:{trialEndsAt}` (stable enough for dedupe)
4. Fire Subscribe **once** when `wallet=linked` (or payment succeeded), with:
   - `txnRefNo` / `paymentId` = that orderId
   - `checkoutMode: 'digisphere'`
   - plan code + amount from catalog
5. Dedupe by `subscribe:{orderId}` in sessionStorage.
6. Also fire Subscribe from Premium unlock UI if return page navigates away before pixel runs — still use the same orderId.

**Do not** require `verifyConversionReceipt(cv)` for Digisphere-only returns (no `cv`). Keep receipt verification for DIY JazzCash paths that still provide it.

Approved TikTok events in Maidan: `PageView` / `ViewContent` / `InitiateCheckout` / `AddPaymentInfo` / **`Subscribe`**. Fire Subscribe only on confirmed success/linked — not on `processing`/`pending` alone unless product policy says otherwise.

---

## 8. Staging UAT checklist

1. Digisphere product webhook URL = **staging API** webhook path.
2. `JAZZCASH_WALLET_RETURN_OVERRIDES` = **staging API** `/callback` (if bridge mode).
3. Backend env has non-empty URL + API key + webhook secret + preferred digisphere; container recreated; `printenv` verified.
4. Digisphere plans amounts match staging product prices (paisas).
5. Product Premium `billingEnabled=true` (or equivalent).
6. Landing → Subscribe → JazzCash → return:
   - Return host is staging SPA `/premium/return?wallet=linked&…`
   - **Not** apex 405
7. Digisphere status: `wallet.linked`, open sub `trialing`/`initiated`, correct `amount_minor`.
8. Product Profile/Premium shows entitled.
9. TikTok: `ttq.track('Subscribe', …)` (or session conversion id recorded).
10. Unlink/cancel UAT user before retesting same MSISDN (Digisphere `alreadySubscribed` skips portal).

### Reset UAT user (ops)

```bash
# Digisphere
POST /v1/subscriptions/{id}/cancel   # open trialing/active
POST /v1/wallets/unlink              # { "userId": "…" }

# Product DB
# mark local subscription cancelled; unlink local wallet rows for that user/msisdn
```

---

## 9. Production cutover order

1. Merge Digisphere code with preferred checkout still **off** / DIY if needed.
2. Digisphere: set **prod** webhook URL + **prod** `JAZZCASH_WALLET_RETURN_OVERRIDES` (API callback, not SPA apex).
3. Digisphere: `WALLET_APP_RETURN_ORIGINS` includes prod SPA.
4. Digisphere plans match **prod** prices.
5. Inject prod secrets into product backend; recreate containers.
6. Flip `PREMIUM_PREFERRED_CHECKOUT=digisphere` (or equivalent).
7. Smoke one real wallet link; verify webhook + entitlement + Subscribe.
8. Keep DIY path only if explicitly required as fallback; otherwise treat Digisphere as sole Premium billing.

**Do not leave staging override active when cutting prod** (JazzCash would return to staging API).

---

## 10. Pitfalls learned on Maidan staging

| Symptom | Cause | Fix |
|---|---|---|
| `payment_service_unconfigured` | Mode digisphere from preferred flag, but URL/key missing in **running** process | Recreate container; verify `printenv` |
| CORS / Network Error | SPA origin not in `CORS_ORIGINS` | Add origin; recreate |
| nginx **405** on return | Override pointed at SPA apex | Use API `/callback` |
| `amount_mismatch` | Digisphere plan 59900 vs product 99000, or old sub snapshot | Align catalog; reprice or cancel old sub |
| Already subscribed / no JazzCash | Previous Digisphere trial still open | Cancel + unlink before retest |
| TikTok Subscribe missing | Digisphere return has no order/cv | Synthesize orderId from `requestId` / userId+trialEndsAt |
| Profile “Not subscribed” after success | DIY reconcile only; no Digisphere status sync | `billing/status` reconcile + refresh entitlement |
| Double `/api/api/…` | Frontend base URL already includes `/api` | Fix API base path |

---

## 11. Acceptance criteria (definition of done)

- [ ] Browser never sees Digisphere API key or payment-service base URL in client bundles.
- [ ] Wallet link goes through product BFF → Digisphere → JazzCash hosted portal.
- [ ] JazzCash return reaches Digisphere wallet-return (directly or via product callback bridge).
- [ ] Digisphere starts trial/sub; webhooks update product entitlement.
- [ ] Product UI shows Premium after return (server authoritative).
- [ ] TikTok (or product conversion pixel) **Subscribe** fires once on Digisphere `wallet=linked` success.
- [ ] Staging and prod Digisphere overrides / webhooks / return origins are environment-correct.
- [ ] Plan amounts match Digisphere catalog (paisas).
- [ ] Unlink/cancel paths stop Digisphere billing and update local entitlement per policy.

---

## 12. Implementation order for the agent

1. Read this playbook end-to-end; map placeholders to the target project.
2. Confirm Digisphere product exists (or ask ops to create): key, webhook secret, merchant, plans.
3. Add backend env + Digisphere HTTP client + link/status/unlink/webhook routes.
4. Add callback bridge **if** merchant uses product-domain return override.
5. Wire SPA link + hosted form submit + return route.
6. Implement entitlement reconcile from Digisphere status + webhooks.
7. Implement §7 Subscribe conversion fix.
8. Align Profile/Premium UI with Digisphere entitlement.
9. Staging UAT §8; then prod cutover §9.
10. Do **not** edit unrelated CI/server templates unless the user explicitly asks.

---

## 13. Reference code map (Maidan)

Use as examples when porting — paths are Maidan-specific.

| Concern | Maidan location |
|---|---|
| Digisphere client + callback forward | `backend/src/services/premiumPaymentService.js` |
| Checkout mode | `backend/src/utilities/premiumCheckoutMode.js` |
| Link / guest / callback / billing status | `backend/src/controllers/premiumBillingController.js` |
| Webhooks | `backend/src/controllers/premiumWebhookController.js` |
| Entitlement sync | `backend/src/services/premiumPaymentReconciliation.js` |
| Env template | `backend/.env.example` |
| Landing JazzCash start | `web-mobile/src/premium/startLandingJazzcash.ts` |
| Return + Subscribe | `web-mobile/src/pages/PremiumCheckout.tsx`, `web-mobile/src/premium/premiumSubscribeConversion.ts` |
| Digisphere unlock fallback | `web-mobile/src/desktop/DesktopPremium.tsx`, `web-mobile/src/pages/PremiumAccount.tsx` |
| Profile entitlement | `web-mobile/src/pages/Profile.tsx` |
| Digisphere service rules | `jazzcash-service/AGENTS.md`, `jazzcash-service/docs/frontend-integration.md` |
| Maidan migration notes | `backend/docs/DIGISPHERE_PAYMENT_FLOW_MIGRATION.md` |

---

## 14. Placeholders to fill per project

Before coding, replace:

| Placeholder | Example |
|---|---|
| `{PRODUCT_CODE}` | Digisphere product code |
| `{PAYMENT_SERVICE_URL}` | `https://payments.codistan.org` |
| `{PRODUCT_API_HOST}` | `api.staging.example.com` / `api.example.com` |
| `{SPA_ORIGIN}` | `https://staging.app.example.com` |
| `{RETURN_PATH}` | `/premium/return` |
| `{CALLBACK_PATH}` | `/callback` |
| `{WEBHOOK_PATH}` | `/api/premium/webhook/payment-service` |
| `{MONTHLY_PAISAS}` / `{YEARLY_PAISAS}` | `99000` / `499900` |
| Bridge mode? | yes/no (merchant allowlist constraint) |

Ask the user for Digisphere API key, webhook secret, merchant IDs, and exact staging/prod hosts if missing — do not invent secrets or commit them.
