# Game Arena Platform

Mobile-first freemium and premium HTML5 gaming platform for Pakistan.

## Product

**Game Arena** lets players discover games through a swipe-first feed, play instantly as guests, sign in with OTP, earn Arena Coins, join challenges and tournaments, and upgrade to **Game Arena+** through locally relevant payment methods.

The initial commercial rules are:

- Freemium: limited/ad-supported catalogue, selected game limits, basic leaderboards, and standard rewards.
- Game Arena+: full catalogue, ad-free access, premium challenges, tournaments, reward eligibility, 2× Arena Coins, and a 10% member top-up discount.
- Monthly plan: PKR 299.
- Yearly plan: PKR 4,999.

## Current status

The repository contains a production-oriented frontend release candidate in [`apps/web`](apps/web) and the complete product, architecture, security, payment, game-ingestion, delivery, and launch plan in [`docs`](docs).

The frontend currently provides:

- Mobile vertical game feed and responsive catalogue
- Search, genres, favourites, recent games, game details, rewards, challenges and tournaments
- Guest browsing and phone/email OTP journeys
- Game Arena+ pricing and JazzCash checkout states
- Arena Coins and premium entitlement states
- Data Saver, reduced motion, offline awareness and PWA installation
- Sandboxed HTML5 game runtime contract
- Mock/live API switching for backend integration
- Analytics, Web Vitals and frontend error hooks
- Static-CDN headers, unprivileged Nginx container and CI release checks

The shell has no runtime dependencies, remote fonts, remote images or third-party scripts.

## Run locally

```bash
cd apps/web
npm run dev
```

Then open `http://localhost:4173`.

## Quality checks

```bash
cd apps/web
npm test
npm run check
npm run smoke
```

## Repository structure

```text
apps/web/        Consumer frontend release candidate
backlog/         Issue, label and milestone source data
docs/            Product and engineering documentation
docs/adr/        Architecture decision records
scripts/         GitHub backlog automation
.github/         CI, issue forms, CODEOWNERS and PR template
```

## Key documents

| Area | Document |
|---|---|
| Executive plan | [`docs/00-executive-plan.md`](docs/00-executive-plan.md) |
| Product requirements | [`docs/01-product-requirements.md`](docs/01-product-requirements.md) |
| Mobile feed UX | [`docs/03-ux-mobile-feed.md`](docs/03-ux-mobile-feed.md) |
| System architecture | [`docs/04-system-architecture.md`](docs/04-system-architecture.md) |
| Game integration | [`docs/05-game-integration.md`](docs/05-game-integration.md) |
| Authentication and security | [`docs/07-auth-security.md`](docs/07-auth-security.md) |
| Premium and payments | [`docs/08-payments-premium.md`](docs/08-payments-premium.md) |
| Testing and quality | [`docs/11-testing-quality.md`](docs/11-testing-quality.md) |
| Roadmap | [`docs/12-roadmap.md`](docs/12-roadmap.md) |
| Brand system | [`docs/15-brand-system.md`](docs/15-brand-system.md) |
| Frontend release | [`docs/21-frontend-production-release.md`](docs/21-frontend-production-release.md) |

## Non-negotiable engineering rules

1. Only one game runs at a time in the swipe feed.
2. Games run on a separate origin in sandboxed iframes.
3. Games may request rewards, but only the server writes the append-only coin ledger.
4. Payment callbacks and webhooks are verified, idempotent, persisted and reconciled.
5. Premium access is derived from entitlements, not directly from payment responses.
6. No platform secret is sent to a game bundle or browser.
7. The shell remains usable on low-memory Android devices and slow networks.
8. Arena Coins are non-transferable, non-withdrawable and have no cash value at launch.
9. Security target: OWASP ASVS 5.0 Level 2, with stricter controls for authentication, payments and rewards.
10. Every production feature includes observability, tests and a rollback path.

## Next delivery step

Import the supplied HTML5 game builds, validate and package them through the game-ingestion pipeline, deploy them to an isolated game origin, and connect the frontend to live authentication, catalogue, payment, entitlement and ledger services.
