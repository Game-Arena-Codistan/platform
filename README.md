# Game Arena

Game Arena is a mobile-first HTML5 gaming platform for Pakistan. It combines swipe-based game discovery with deliberate catalogue browsing, frictionless OTP access, JazzCash premium checkout, Arena Coins, challenges and tournaments.

## Product model

### Free
- Limited, ad-supported catalogue
- Play limits on selected games
- Basic leaderboards
- Standard reward access

### Game Arena+
- Full catalogue access
- Ad-free play
- Premium challenges and tournaments
- Reward eligibility and 2× Arena Coins
- 10% member top-up discount
- PKR 299 monthly or PKR 4,999 yearly

## Repository

```text
apps/web/                 Production-oriented static PWA
apps/web/src/             Native ES modules
apps/web/styles/          Design tokens and responsive UI
apps/web/assets/          SVG brand assets
apps/web/scripts/         Dependency-free CI checks
docs/                     Product and architecture decisions
.github/workflows/        Frontend validation
```

## Run locally

```bash
cd apps/web
npm run dev
```

Open `http://localhost:8080`.

## Validate

```bash
cd apps/web
npm run ci
```

The release gate checks JavaScript syntax, required security controls, commercial fixtures, PWA files, static asset references and the 115 KB core-shell budget.

## Production image

```bash
cd apps/web
docker build -t game-arena-web .
docker run --rm -p 8080:8080 game-arena-web
```

## Integration boundaries

The frontend runs in mock mode by default. Set `window.GAME_ARENA_CONFIG` before `src/app.js` loads to provide API and game origins:

```html
<script>
window.GAME_ARENA_CONFIG = {
  mode: 'live',
  apiBaseUrl: 'https://api.example.com',
  gameOrigin: 'https://games.example.com'
};
</script>
```

Games are treated as untrusted and run in sandboxed iframes on a separate origin. Payments and rewards are server-authoritative; the browser never grants premium access or changes coin balances directly.

## Current status

This branch contains the frontend release candidate and the contracts required for the next phase: importing the real HTML5 catalogue, implementing OTP and JazzCash services, and connecting entitlements, coins and tournament APIs.
