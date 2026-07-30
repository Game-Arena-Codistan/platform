# Game runtime operations

```bash
npm run ci
npm run probe
node src/package-build.mjs <game-id> <version> <source-directory>
```

`probe` checks every live catalogue entry point and writes JSON and Markdown reports. Set `GAME_PROBE_STRICT=1` to fail when any game is unreachable or does not return HTML from the approved host.

The packager accepts only directory builds with `index.html`, rejects symlinks and executable/server files, enforces a 25 MB limit, creates SHA-256 hashes, and publishes to `apps/game-origin/public/games/<id>/<version>/`.
