# Four-game oversized build pilot

Tracks #79. Production activation is disabled throughout this runbook.

## Scope

The pilot imports these immutable modified HTML5 builds:

- Duck Hunter
- Ranger vs Zombies
- Robotex
- Swat vs Zombies

The expected sizes, SHA-256 digests, local paths and provisional manifests are pinned in `catalogue/pilots/oversize-four.json`.

## Safety model

Normal imports keep the existing 25 MiB defaults. Only the protected pilot workflow supplies the bounded oversized limits:

- compressed archive: 128 MiB;
- expanded content: 512 MiB;
- file entries: 5,000;
- compression ratio: 250;
- extraction timeout: 120 seconds;
- temporary free-space reserve: 1 GiB.

Hard ceilings in code prevent repository or workflow configuration from increasing these beyond 256 MiB compressed, 1 GiB expanded, 10,000 entries, ratio 500 or ten minutes extraction time.

ZIP64, encryption, multi-disk archives, unsafe paths, case collisions, symlinks/special files, unsupported compression, suspicious ratios, executable/server files, remote executable scripts and trackers remain blocked.

## Ingress and backup

`tools/game-content/Publish-OversizePilotRelease.ps1`:

1. verifies each deployable ZIP against the pinned size and digest;
2. normalizes the four deployable asset names;
3. creates Original and Modified source snapshots unless `-SkipSourceSnapshots` is supplied;
4. writes a checksum manifest;
5. creates a private draft GitHub Release;
6. uploads the release assets;
7. dispatches the protected staging workflow.

The draft release is the immutable GitHub backup and private workflow ingress for the pilot. It must remain draft/private. No game binary is committed to Git history.

## Protected import

`.github/workflows/game-content-oversize-pilot.yml` runs on the Windows self-hosted runner. It downloads release assets through the GitHub API, verifies exact size and SHA-256, preflights and scans the archives, packages immutable versions, and uploads audit evidence.

When `publish_to_staging=true`, the workflow authenticates to AWS using the protected staging OIDC role and publishes to:

`games/<slug>/1.0.0-pilot.1/`

The workflow refuses to overwrite an existing version. Generated metadata has `rolloutPercentage: 0` and `productionActivation: false` and is proposed through a review pull request.

## Operator command

Run only after the implementation PR is merged and the staging environment variables/secrets are available:

```powershell
Set-Location -LiteralPath "<platform clone>"

.\tools\game-content\Publish-OversizePilotRelease.ps1 `
  -RootPath "D:\60 Games Bundle by Muscle-SS" `
  -Repository "Game-Arena-Codistan/platform" `
  -WorkflowRef "main"
```

Prerequisites:

- GitHub CLI installed and authenticated with access to the private repository;
- self-hosted runner online;
- staging `AWS_ACCOUNT_ID`, `AWS_REGION`, `AWS_CONFIG_PREFIX` and `AWS_GAME_PUBLISH_ROLE_ARN` configured;
- issue #79 rights references recorded before staging publication.

## Evidence and completion

Retain the draft release URL, workflow run URL, workflow artifact, generated metadata PR, S3 object paths, browser qualification results and rollback proof. Public production activation remains a separate approval under #75 and #40.
