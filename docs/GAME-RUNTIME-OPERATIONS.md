# Game runtime operations

## Current state

The 44 approved catalogue entries still run from `https://games.codistan.org`. The runtime probe checks reachability, HTTPS, final host, response type, and HTML entry-point content. It does not certify gameplay correctness.

## Controlled origin

Production builds are published as immutable versions:

```text
/games/<game-id>/<version>/index.html
```

Each build must include a generated `game-manifest.json` containing file sizes and SHA-256 hashes. The origin serves no cookies, exposes only static files, restricts framing to Game Arena domains, and blocks hidden paths.

## Release flow

1. Obtain the original game directory or ZIP and confirm redistribution rights.
2. Extract it outside the repository.
3. Run the versioned packager in `apps/game-ops`.
4. Review warnings and the generated manifest.
5. Run browser/device QA and Game Bridge tests.
6. Deploy the game-origin image and update the catalogue URL only after certification.

Network probe failures must quarantine a game before a public release. Full gameplay certification remains required for controls, orientation, audio, pause/resume, score events, completion, memory use, and mobile-browser behavior.
