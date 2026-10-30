# Admin Campaign Analytics + Excel Export — Implementation Brief

**Purpose:** Hand this file to Cursor in **another project** to rebuild the same admin analytics experience SkillUp uses: campaign attribution tables on an admin panel, plus Excel/CSV export for a **daily-shaped report** and a **full range report**.

**Audience:** Cursor / engineers implementing in a different codebase  
**Reference product:** SkillUp Premium admin (`/en/admin/premium?tab=campaign`)

---

## 0. Critical architecture rule (do not get this wrong)

| Layer | What it is | Official subscription (“Subs”) count? |
| --- | --- | --- |
| **GA4 (gtag in the browser)** | Marketing events sent to Google Analytics | **No** |
| **Ops funnel events** (your DB event log) | Paywall → cart → subscribe funnel for ops emails | **No** |
| **Succeeded payments + stored UTM/campaign attribution** | Admin panel grids + Excel/CSV | **Yes** |

**Never** pull GA4 (Analytics Data API / BigQuery / Measurement Protocol reports) into the admin Subs dashboard.

GA4 and the admin report share the **same landing UTM dimensions** (`utm` / `package` / `parameter`), but:

- GA4 = marketing optimization in Google’s UI  
- Admin = **your payments database**, filtered to successful charges, grouped by those dimensions

Admin UI copy should say something like:

> Official Subs count comes from succeeded payment orders with stored attribution. GA4 and ad pixels are not used here.

Timezone for day buckets: use a fixed business TZ (SkillUp uses **Asia/Karachi**).

---

## 1. What the admin panel shows

### Surface
- Admin Premium workspace with tabs (Summary, **Campaign attribution**, Payments, Memberships, Exports, …)
- Campaign tab URL pattern: `/admin/premium?tab=campaign` (or equivalent)

### Campaign tab layout (rebuild this UX)

1. **Shared date filters**  
   Presets: `today | yesterday | last_7_days | last_30_days | current_month | previous_month | custom`  
   Aggregation: `daily | monthly`  
   Optional filters: plan/package, payment status (default succeeded), search

2. **KPI cards**  
   - Total subscriptions (count of succeeded payments in range)  
   - Total amount (minor units / currency)

3. **Download spreadsheet** button  
   Client-side download of the **currently loaded filter range** as `.xls` (SpreadsheetML). This is the practical **“full report for selected range”** download from the Campaign tab.

4. **Daily report table** (pivoted)  
   - Rows = dates  
   - Columns = live Platform values + Total Subs + Plan/Package IDs + Parameter/UTM  
   - Data source: `daily[]` from the campaign attribution API

5. **Detailed View** (two tables)  
   - Platform × Parameter  
   - Plan/Package × Parameter  
   - Data source: `detailed.platformByParameter` / `detailed.packageByParameter`

6. **Optional hygiene** (export-capable admins only)  
   Omit / restore specific payment rows from the campaign grid without deleting billing history (`omitFromCampaignReport: true` on attribution JSON).

7. **Exports tab** (separate)  
   Audited **backend-generated CSV** for report type `campaign_attribution` (another “full report” path with audit trail + download expiry).

### Charts
SkillUp uses **tables + KPIs only** (no charts). You may add charts later; they are not required to match the current product.

---

## 2. End-to-end data flow (rebuild this spine)

```
Landing URL (?utm=&package=&parameter=&payment=)
  │
  ├─► [Optional] GA4 gtag events → Google only (landing_view, add_to_cart, purchase…)
  │
  ├─► Capture attribution in browser (localStorage, ~30 day TTL)
  │     keys like: utm, utm_source, package, parameter, payment, landing, landingPath
  │
  ├─► Send `attribution` JSON on checkout / payment start API
  │
  └─► Persist sanitized attribution on:
        • user (last-touch)
        • payment intent / checkout session
        • payment_orders.attribution   ← OFFICIAL SUBS SOURCE

Payment succeeds (status = succeeded, completed_at set)
  └─► Admin aggregator SQL:
        GROUP BY business-day(TZ), platform, package, parameter
  └─► Admin Campaign tab + Excel/CSV exports
```

### Landing URL contract (dimensions)

| Query param | Report dimension | Examples |
| --- | --- | --- |
| `utm` | Platform | `D` (direct), `T` (TikTok), `M` (Meta) |
| `package` | Plan / package | `default`/`1` = monthly, `2` = yearly |
| `parameter` | Campaign / offer / partner | `default`, `20percentoff`, partner codes |
| `payment` | Payment rail (store; not a Subs pivot column) | `jazzcash` |

**Rule:** If `utm` is set and `utm_source` is empty → copy `utm` → `utm_source`.

Sanitize on the server: allowlist keys only, clip string length (e.g. 80 chars; path fields 120).

---

## 3. API to implement

### 3.1 Campaign attribution report (read)

```
GET /v1/admin/reports/premium/campaign-attribution
  ?preset=last_7_days
  &aggregation=daily
  &from=...&to=...          # required when preset=custom
  &planCode=...             # optional
```

**Auth capability:** `premium.report.read` (or your equivalent analyst+ role).

**Response shape (match this contract):**

```ts
{
  reportSchemaVersion: "premium-campaign-attribution.v1",
  timezone: "Asia/Karachi", // or your business TZ
  effectiveRange: { from: ISO, to: ISO, preset: string },
  aggregation: "daily" | "monthly",
  totals: { subscriptions: number, amountMinor: number },
  basic: Array<{
    date: string; // YYYY-MM-DD in business TZ
    platform: string;
    package: string;
    parameter: string;
    subscriptions: number;
    amountMinor: number;
  }>,
  detailed: {
    platformByParameter: Array<{
      date: string;
      platform: string;
      parameter: string;
      subscriptions: number;
      amountMinor: number;
    }>,
    packageByParameter: Array<{
      date: string;
      package: string;
      parameter: string;
      subscriptions: number;
      amountMinor: number;
    }>,
  },
  daily: Array<{
    date: string;
    subscriptions: number;
    amountMinor: number;
    byPlatform: Record<string, number>,
    byPackage: Record<string, number>,
    byParameter: Record<string, number>,
  }>,
  exportRows: Array<{
    view: "total" | "basic" | "platform_x_parameter" | "package_x_parameter" | "daily";
    date: string;
    platform?: string;
    package?: string;
    parameter?: string;
    subscriptions: number;
    amountMinor: number;
  }>
}
```

**SQL filter rules:**
- payment status = `succeeded`
- `completed_at` within resolved range
- skip rows where `attribution.omitFromCampaignReport === true`
- max range ~366 days

### 3.2 Client spreadsheet source
The Campaign tab already has the JSON from 3.1. **Do not** call GA4. Build CSV/XLS from `detailed` + `daily`.

### 3.3 Audited backend export (full report with audit)

```
POST /v1/admin/reports/premium/exports
Body: {
  reportType: "campaign_attribution",
  filters: { preset, aggregation, from?, to?, ... },
  reason: "Business reason string (required for audit)"
}
→ 201 { id, expiresAt, ... }

GET /v1/admin/reports/premium/exports
GET /v1/admin/reports/premium/exports/:id/download   # CSV
```

**Auth capability:** `premium.report.export`  
Store export metadata + payload hash, expire downloads (SkillUp uses ~24h), cap rows (e.g. 5000).

### 3.4 Optional: list orders + hygiene

```
GET  /v1/admin/reports/premium/campaign-attribution/orders?preset=...&omitted=all&limit=50
POST /v1/admin/reports/premium/campaign-attribution/hygiene
Body: { action: "omit" | "restore", reason, match? | orderIds? }
```

---

## 4. Excel / CSV export — “daily” vs “full”

SkillUp does **not** have a single dropdown labeled “Daily vs Full”. Rebuild the **same two product behaviors**:

### Option A — Daily-shaped report (on-screen + optional email)

| Channel | Behavior |
| --- | --- |
| **Admin Daily report table** | Pivot of `daily[]` for the selected filter range |
| **Scheduled email (optional)** | Once per day in business TZ (e.g. 06:00 PKT), attach CSV for **`preset=yesterday` only**, filename like `campaign-daily-YYYY-MM-DD.csv` |

Daily email CSV views SkillUp uses: `platform_parameter`, `package_parameter`, `daily_total`.

### Option B — Full report for selected range (admin download)

| Channel | Behavior |
| --- | --- |
| **Campaign tab → “Download spreadsheet”** | Client builds CSV rows from current API payload → wraps as SpreadsheetML `.xls` | 
| **Exports tab → Campaign attribution** | Server builds CSV from `exportRows` for the same filters; audited |

#### Client CSV column contract (Spreadsheet download)

```
date,view,platform,parameter,package,count
```

`view` values emitted by the client builder:
- `platform_parameter` — from `detailed.platformByParameter`
- `package_parameter` — from `detailed.packageByParameter`
- `platform` / `package` / `parameter` — expanded from each `daily` day’s maps

Treat empty / `none` / `unknown` dimension labels as blank cells.

#### Client `.xls` without ExcelJS/xlsx (recommended for SkillUp parity)

1. Build CSV string as above  
2. Parse into rows  
3. Emit **SpreadsheetML** XML workbook (Excel opens as `.xls`)  
4. Download via Blob:

```ts
const blob = new Blob([xml], { type: "application/vnd.ms-excel;charset=utf-8" });
// anchor.download = "premium-campaign-attribution-{preset}.xls"
```

Include simple styles: bold dark header, alternating grey/white rows.

You *may* use `exceljs` / SheetJS instead; SkillUp intentionally avoided heavy Excel deps.

---

## 5. Optional GA4 marketing layer (parallel, not admin)

If the other project also wants GA4 on landings (same as SkillUp):

### Env
```
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXX
# or runtime-injected meta tag / config endpoint
```

### Client helpers
- Load `https://www.googletagmanager.com/gtag/js?id=G-…`
- `gtag('config', id)` then `gtag('event', name, params)`
- Never throw from analytics helpers

### Suggested events

| When | Events |
| --- | --- |
| Landing load | `landing_view`, `view_item` |
| Checkout start | `add_to_cart`, `begin_checkout` |
| Payment return success | `subscribe` (monthly) or `purchase` (yearly); dedupe by order id in `sessionStorage` |

Map `utm` → `traffic_source`: `M`→`meta`, `T`→`tiktok`, else `direct`.

**Do not** display these events in the admin Subs tables.

---

## 6. Roles / permissions

| Capability | Who | What |
| --- | --- | --- |
| `premium.report.read` | Analyst, payment ops, security admin | View Campaign tab + KPIs + tables |
| `premium.report.export` | Payment ops, security admin (not analyst) | Exports tab, hygiene omit/restore |

Client “Download spreadsheet” can work for anyone who can **read** the already-loaded JSON (SkillUp does not gate that button on export capability). Backend CSV create/download **must** require export capability.

---

## 7. Database pieces to add

1. **Attribution JSON** on payment orders (and optionally users / intents):

```json
{
  "utm": "T",
  "utm_source": "T",
  "package": "2",
  "parameter": "20percentoff",
  "payment": "jazzcash",
  "landing": "landing2",
  "landingPath": "/landing2?utm=T&package=2&parameter=20percentoff&payment=jazzcash"
}
```

Hygiene flag (payments only):

```json
{ "omitFromCampaignReport": true }
```

2. Index for reporting queries on succeeded payments by `(completed_at)` and expression indexes on `attribution->>'utm'` / package / parameter if needed.

3. **Export tables** (if using audited Exports tab): export metadata + payload blob + sha256 + expiry.

4. Optional **funnel events** table/allowlist for ops (separate from Subs).

---

## 8. Admin UI implementation checklist (for Cursor)

Implement in this order:

1. [ ] Capture attribution on landing + persist through checkout onto **succeeded payments**  
2. [ ] `GET .../campaign-attribution` aggregator (Karachi/business-TZ day buckets)  
3. [ ] Admin Campaign tab: filters, KPIs, Daily table, Detailed tables  
4. [ ] Client CSV builder + SpreadsheetML `.xls` download button (“full report for current filters”)  
5. [ ] Exports tab: `POST/GET` audited CSV for `campaign_attribution`  
6. [ ] (Optional) Daily email job for yesterday CSV  
7. [ ] (Optional) Hygiene omit/restore  
8. [ ] (Optional) GA4 gtag on landings only — never as Subs source  

### Acceptance tests

1. Open a landing with `?utm=T&package=2&parameter=20percentoff&payment=…`  
2. Complete a paid subscription in staging/test  
3. Confirm payment row is `succeeded` with matching `attribution` JSON  
4. Admin → Campaign attribution for that day shows **+1** under platform `T`, package `2`, parameter `20percentoff`  
5. **Download spreadsheet** opens in Excel with `date,view,platform,parameter,package,count` rows  
6. Exports tab can create + download `campaign_attribution` CSV for the same range  
7. (If GA4 configured) DebugView shows landing/purchase events — counts may differ from admin Subs; that is expected  

---

## 9. SkillUp reference file map (this monorepo)

Use these as patterns to copy/adapt — not as hard imports.

| Area | Paths |
| --- | --- |
| Product doc (longer history) | `docs/product/PREMIUM_CAMPAIGN_ANALYTICS_IMPLEMENTATION.md` |
| Admin reporting doc | `docs/admin/PREMIUM_ADMIN_AND_REPORTING.md` |
| Landing URLs | `docs/product/PREMIUM_CAMPAIGN_LANDING_URLS.md` |
| Admin UI workspace | `apps/web/app/[locale]/admin/premium/premium-workspace.tsx` |
| Client CSV | `apps/web/app/[locale]/admin/premium/campaign-attribution-csv.ts` |
| Client Excel (.xls XML) | `apps/web/app/[locale]/admin/premium/campaign-attribution-xlsx.ts` |
| Report aggregator | `apps/api/src/premium-campaign-attribution-report.ts` |
| Routes | `apps/api/src/premium-reporting-routes.ts` |
| Audited export | `apps/api/src/premium-export-service.ts` |
| Attribution sanitize | `apps/api/src/premium-attribution.ts` |
| UTM capture | `apps/web/lib/utm-attribution.ts` |
| GA4 gtag | `apps/web/lib/ga4.ts`, `apps/web/lib/landing-analytics.ts` |
| Daily email | `apps/api/src/campaign-daily-report-email.ts` |
| Migrations | `packages/database/drizzle/0029_premium_campaign_attribution.sql`, `0030_premium_funnel_events.sql` |

---

## 10. Prompt you can paste into Cursor in the other project

```text
Implement admin campaign analytics like SkillUp using this brief:
resources/ADMIN_CAMPAIGN_ANALYTICS_AND_EXCEL_EXPORT_IMPLEMENTATION.md

Requirements:
1. Official Subs come ONLY from succeeded payments + stored UTM attribution (utm/package/parameter). Do NOT use GA4 as the admin data source.
2. Admin Campaign tab with date presets, KPIs, Daily pivoted table, Detailed platform×parameter and package×parameter tables.
3. "Download spreadsheet" for the current filter range: build CSV (date,view,platform,parameter,package,count) then SpreadsheetML .xls (or ExcelJS).
4. Exports tab: audited backend CSV for reportType=campaign_attribution (full report for selected filters).
5. Optional: scheduled daily email CSV for yesterday only.
6. Optional parallel GA4 gtag on landings for marketing only.

Match the API response shape and CSV column contract in the brief. Prefer Asia/Karachi (or document the business timezone you choose).
```

---

## 11. Glossary

| Term | Meaning |
| --- | --- |
| **Daily report** | Per-day pivot / yesterday email CSV |
| **Full report** | Export of the selected filter range (client `.xls` or audited CSV `exportRows`) |
| **Platform** | `utm` / traffic source code (`D`/`T`/`M`/…) |
| **Package** | Plan code (`1` monthly, `2` yearly, …) |
| **Parameter** | Offer / partner / campaign code |
| **Subs** | Count of succeeded payments in range (not GA4 sessions) |
