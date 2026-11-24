# Game Arena — TikTok Pixel integration

**Marketing only.** TikTok Pixel is not the source of truth for paid subscriptions, revenue, or entitlement. Prefer JazzCash provider events + server attribution.

## Client campaign

| Item | Value |
| --- | --- |
| Landing URL | `https://gsmarena-play.com/landing1?utm=T&package=1&parameter=monthly10k&payment=jazzcash` |
| Staging equivalent | `https://gsmarena-play.codistan.org/landing1?utm=T&package=1&parameter=monthly10k&payment=jazzcash` |
| TikTok Pixel ID | `DBU5QTJC77UCDH70PUBG` |
| Traffic marker | `utm=T` → `traffic_source: tiktok` |

## Implementation

| Piece | Location |
| --- | --- |
| Browser loader | `apps/web/src/tiktok-pixel.js` |
| Funnel wiring (beside GA4) | `apps/web/src/landing-analytics.js` |
| Runtime meta | `apps/web/index.html` → `meta[name=game-arena-tiktok-pixel-id]` |
| Runtime config | `apps/web/deploy/40-game-arena-config.sh` + `config.js` (`tiktokPixelId`) |
| CSP | `apps/web/index.html`, `apps/web/_headers` |

## Event map (client-approved only)

| Product moment | TikTok event |
| --- | --- |
| Landing open (`/landing1`, `/mainLanding`) | `PageView`, `ViewContent` |
| Subscribe Now + JazzCash MSISDN submit | `InitiateCheckout`, `AddPaymentInfo` |
| Payment / subscription success with granted `orderId` | `Subscribe` (`event_id` = subscription id; once) |
| Wallet link or return without `orderId` | no conversion event |
| Failed / pending payment | no conversion event |

Do **not** fire `AddToCart` or `CompletePayment`.

`Subscribe` runs only when the return URL has a real `orderId` (server subscription id). Campaign context is stored in `localStorage` as well as `sessionStorage` so JazzCash’s cross-site return can still build the payload. The pixel calls `ttq.page()` once on that new document before `ttq.track('Subscribe')`.

Conversions are deduped once per order id in `sessionStorage` (`lp_sent_tokens`).

## Environment

```dotenv
TIKTOK_PIXEL_ID=DBU5QTJC77UCDH70PUBG
```

Resolution order:

1. `<meta name="game-arena-tiktok-pixel-id">`
2. `window.GAME_ARENA_CONFIG.tiktokPixelId`
3. Documented product default `DBU5QTJC77UCDH70PUBG`

## Verification

1. Open the campaign landing URL.
2. Confirm meta pixel id `DBU5QTJC77UCDH70PUBG`.
3. Network: `analytics.tiktok.com` script/connect not CSP-blocked.
4. Pixel Helper: `PageView` + `ViewContent`.
5. Click Subscribe Now (with JazzCash number): `InitiateCheckout` + `AddPaymentInfo` only.
6. Staging payment success: one `Subscribe` for the order id (no `CompletePayment`).
7. Repeat success with same order id: no second `Subscribe`.

## Notes

- Pixel totals are secondary to JazzCash webhook / billing DB evidence.
- Do not commit TikTok Events API tokens.
- Guide playbook: `resources/TIKTOK_PIXEL_AGENT_GUIDE.md`.
