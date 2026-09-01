# 60-game portfolio staging bundle

This runbook covers the bounded 60-title portfolio currently being prepared under issues #74 and #79. It does not replace the general catalogue onboarding contract.

## Current local handoff

The operator-local migration state has 56 normal HTML5 titles prepared by migration script 1.0.5 after ZIP preflight and static scanning. `candy-super-lines` and `super-color-lines-match-5` required only legacy browser-support links in `index.html` to move from `http://` to `https://`; both then passed the same preflight/scanner controls.

The remaining four titles are the validated oversized set from `catalogue/pilots/oversize-four.json`:

- `duck-hunter`
- `ranger-vs-zombies`
- `robotex`
- `swat-vs-zombies`

No game ZIPs or expanded binaries belong in this repository.

## Bundle ingress

`tools/game-content/Publish-PortfolioBundleRelease.ps1` packages each of the 56 prepared normal game directories into a portable ZIP while excluding the generated `game-manifest.json`, adds the four exact oversized assets, creates `bundle-registry.json`, and uploads the 61 files to a private draft GitHub Release.

The registry pins the exact ZIP size and SHA-256 for every title and forces every manifest to rollout `0` with production activation disabled. The local script requires GitHub CLI authentication but does not require local AWS credentials.

Example:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force

.\tools\game-content\Publish-PortfolioBundleRelease.ps1 `
  -RootPath 'D:\60 Games Bundle by Muscle-SS' `
  -PreparedStatePath 'D:\60 Games Bundle by Muscle-SS\_game-arena-prepare-20260901-153049'
```

The script dispatches `.github/workflows/game-content-portfolio-bundle.yml` after the draft release upload unless `-SkipWorkflowDispatch` is supplied.

## Protected staging publication

The bundle workflow:

1. requires the ingress Release to remain draft/private;
2. requires exactly 60 unique games and safe release asset names;
3. verifies every ZIP against the registry size and SHA-256;
4. applies the bounded ZIP preflight and static scanner to every build;
5. creates immutable game manifests with rollout `0`;
6. authenticates to staging AWS only through the protected GitHub OIDC role;
7. resolves the staging artifact bucket from SSM;
8. publishes with `aws:kms` server-side encryption;
9. verifies an already-existing immutable version by `buildSha256` rather than overwriting it;
10. opens a metadata-only review pull request and retains audit evidence.

The workflow does not activate catalogue rollout, rewards, competitions or production.

## Completion boundary

Successful S3 publication is only the binary-publication step of #74. Titles remain paused until the metadata PR is reviewed and the controlled-origin/catalogue/API activation path is qualified. Rights/source approval remains governed by #73, and browser/controlled-origin certification remains governed by #75.
