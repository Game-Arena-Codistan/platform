# 60-game portfolio staging bundle

This runbook covers the bounded 60-title portfolio under issues #74 and #79. The current staging target is the existing Codistan-hosted staging server. AWS and S3 are not part of this staging publication path.

## Validated ingress

The private draft release `portfolio-ingress-60-20260901` contains `bundle-registry.json` plus the 60 normalized game ZIPs. The registry pins the exact ZIP size and SHA-256 for every title and keeps production activation disabled.

The import pipeline re-downloads the private assets, verifies every digest, applies bounded ZIP preflight and the static scanner, and packages all 60 builds before any server write is allowed. No game ZIPs or expanded binaries are committed to this repository.

## Local staging publication

`.github/workflows/game-content-local-staging.yml` is the staging publication path for this bundle. It reuses the staging server's existing protected SSH deployment credentials rather than cloud-object-storage credentials.

For every scanner-approved title it:

1. prepares an immutable package at `games/<slug>/<version>/`;
2. transfers the validated package to the staging server over the pinned SSH host identity;
3. installs it under `/opt/codistan/platform/game-content/games/<slug>/<version>/` without overwriting an existing different digest;
4. bind-mounts `/opt/codistan/platform/game-content/games` read-only into the existing `game-origin` container at `/usr/share/nginx/html/games`;
5. verifies the controlled-origin entrypoint locally through `game-origin`;
6. writes the 60 catalogue records to the staging PostgreSQL runtime at `review` / rollout `0`;
7. creates and merges the metadata-only review PR under `catalogue/releases/<slug>/<version>.json`;
8. activates only those same digest-pinned records as `live` / rollout `100` on staging;
9. restarts the API so the persisted catalogue is reloaded; and
10. certifies all 60 public catalogue records and all 60 controlled-origin launch URLs through `https://gsmarena-play.codistan.org`.

Rewards and competitions remain disabled for this imported portfolio. The workflow does not perform any production publication.

## Controlled local game origin

The staging gateway already routes `/games/` to the `game-origin` service. The game-origin Nginx configuration serves a local file first with `try_files`; therefore a mounted game is served directly at:

`/games/<slug>/<version>/<entrypoint>`

No S3 fallback is required for these 60 titles.

## Completion boundary

For this staging bundle, completion means all of the following are true in one successful workflow run: 60/60 scanner/preflight pass, 60 immutable local versions are installed or verified as identical, metadata is recorded on `main`, 60/60 runtime catalogue records are live at 100% staging rollout, and 60/60 launch URLs return successfully from the controlled staging origin.
