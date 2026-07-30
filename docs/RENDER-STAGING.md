# Render staging deployment

This Blueprint provisions a complete staging environment from `render.yaml`:

- public same-origin gateway and player PWA
- private API, web shell and operations console services
- separate public game origin
- managed PostgreSQL with no public database allow-list
- database migration before API deployment
- generated staging webhook/admin secrets
- mock OTP and JazzCash providers

The default region is Singapore. The selected instance and database plans can incur hosting charges; review them in Render before applying the Blueprint.

## Create the environment

1. Sign in to Render and connect the GitHub account that can access `Game-Arena-Codistan/platform`.
2. Choose **New → Blueprint** and select this repository.
3. Keep the Blueprint path as `render.yaml` and branch as `main`.
4. Review the five services and one PostgreSQL database, then apply the Blueprint.
5. Wait until `game-arena-staging` and `game-arena-games-staging` report healthy.

The expected endpoints are:

- Player platform: `https://game-arena-staging.onrender.com`
- Operations console: `https://game-arena-staging.onrender.com/ops/`
- Gateway health: `https://game-arena-staging.onrender.com/healthz`
- Game-origin health: `https://game-arena-games-staging.onrender.com/healthz`

Render service names determine the default hostnames. If Render changes a name because it is unavailable, update these environment variables to the actual HTTPS URLs and redeploy:

- API: `PUBLIC_ORIGIN`, `ALLOWED_ORIGINS`
- Web: `GAME_ARENA_GAME_ORIGIN`, `GAME_ARENA_GAME_HOSTS`
- Game origin: `GAME_ARENA_FRAME_ANCESTORS`

## Staging access

The API service generates `ADMIN_API_KEYS`. Reveal that value from the API service environment settings and enter it at `/ops/`. Do not post it in GitHub issues or chat.

OTP delivery and JazzCash are intentionally in mock mode. The OTP journey returns a staging debug code; the checkout journey verifies platform state without contacting a real wallet. Real credentials are added only after provider approval.

## Smoke qualification

After the first deployment:

1. Open the player URL in a private browser window.
2. Request and verify an OTP using the displayed staging debug code.
3. Play a free title and confirm the play session completes.
4. Start a Game Arena+ checkout and verify the mock paid return activates premium.
5. Open `/ops/`, enter the generated admin key and confirm metrics, users, payments, games and audit views load.
6. Confirm game iframes load from `game-arena-games-staging.onrender.com`, not the player origin.
7. Record the deployed Git commit and results in issue #41.

## Moving from mock to provider sandbox

Change the API environment only after credentials are supplied privately:

- `OTP_PROVIDER_MODE=http`
- primary and secondary OTP endpoint, API key, sender/template settings
- `ALLOW_DEBUG_OTP=false`
- `JAZZCASH_MODE=hosted`
- merchant ID, password, integrity salt, action URL, return URL and webhook secret

Keep automatic renewal disabled unless JazzCash confirms the capability in writing and the customer disclosure is approved.

## Production boundary

This Blueprint is a staging convenience, not the final production topology. Production still requires custom domains, private admin access through MFA/SSO, approved secret management, backups/PITR, object storage/CDN for licensed games, provider monitoring, legal approval and the full manual qualification in issue #41.
