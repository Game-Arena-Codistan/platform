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

## Event map

| Product moment | TikTok event |
| --- | --- |
| Landing open (`/landing1`, `/mainLanding`) | `PageView`, `ViewContent` |
| Subscribe Now CTA | `AddToCart`, `InitiateCheckout` |
| Payment success (monthly) | `Subscribe` (`event_id` = order / txn id) |
| Payment success (yearly) | `CompletePayment` (`event_id` = order / txn id) |
| Failed / pending payment | no conversion event |

Conversions are deduped once per `transaction_id` in `sessionStorage` (`lp_sent_tokens`).

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
5. Click Subscribe Now: `AddToCart` + `InitiateCheckout`.
6. Staging payment success: one `Subscribe` / `CompletePayment` for the order id.
7. Repeat success with same order id: no second conversion.

## Notes

- Pixel totals are secondary to JazzCash webhook / billing DB evidence.
- Do not commit TikTok Events API tokens.
- Guide playbook: `resources/TIKTOK_PIXEL_AGENT_GUIDE.md`.
