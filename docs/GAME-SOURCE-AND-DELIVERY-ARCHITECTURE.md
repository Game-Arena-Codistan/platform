# Game source, backup and delivery architecture

## Decision

Use a three-layer model:

1. **Private GitHub source repositories** for maintainable Construct projects, scripts, manifests and history.
2. **Immutable source snapshots** for complete original and modified bundles.
3. **S3 + CloudFront controlled-origin builds** for production delivery.

Do not place the 60-game bundle, generated HTML5 ZIPs, Android/iOS exports or expanded binaries in the platform repository.

## Source repository model

Create one private repository per game under `Game-Arena-Codistan`, generated from a common template. This keeps clone size, history, permissions and releases isolated and prevents one large binary-heavy monorepo from becoming unmaintainable.

Repository naming:

`game-<slug>`

Example:

`game-duck-hunter`

Recommended layout:

```text
/game.json
/README.md
/RIGHTS-REFERENCE.md
/source/construct3/
/source/construct2/
/source/scripts/
/source/small-assets/
/patches/
/tests/
/tools/
.github/workflows/
.gitattributes
.gitignore
```

For Construct 3, convert `.c3p` files to folder projects so the JSON and script files can be versioned and reviewed. Ignore `.uistate.json` files. Large editable binary assets may use Git LFS selectively; generated exports must not use Git history.

## Immutable snapshots

For every imported baseline and approved source release, create a private GitHub Release tag such as `source-v1.0.0` containing:

- original vendor/source archive;
- modified Construct project archive;
- modified HTML5 export ZIP;
- SHA-256 checksum manifest;
- non-sensitive provenance and rights reference;
- tool/version notes.

Also copy the complete source snapshots to a private encrypted S3 archive bucket with versioning and lifecycle transition to Glacier Deep Archive. GitHub is the maintenance system; S3 is the disaster-recovery archive. Neither is the public game host.

## Git LFS policy

Use Git LFS only for editable binary assets needed during normal source work, such as large images, audio, video and Construct binary files that cannot be represented as folder projects.

- Keep the organization LFS budget at zero to prevent surprise charges.
- Enable usage alerts.
- CI checks out LFS objects only for the selected game.
- Never fetch all 60 games in routine platform CI.
- Keep generated ZIPs and mobile exports out of LFS and attach them to Releases/archive storage instead.

## Production build and publication

Each approved game is published independently as immutable static content:

```text
games/<slug>/<version>/index.html
games/<slug>/<version>/game-manifest.json
games/<slug>/<version>/...
```

Use the existing protected game-content importer and publisher in `Game-Arena-Codistan/platform`.

Publication flow:

1. Select one approved game source release.
2. Produce or accept the modified HTML5 ZIP.
3. Run archive preflight and static scanning.
4. Inject/validate the Game Bridge adapter and platform-safe configuration.
5. Generate checksums, provenance and the immutable manifest.
6. Run local/browser qualification.
7. Publish the version to the private S3 game-artifact bucket through the protected AWS role.
8. Serve through one CloudFront distribution and one controlled game hostname.
9. Commit only release metadata, digests and non-sensitive audit results to the platform repository.
10. Activate the version through the platform catalogue/admin controls.

No container, server or Kubernetes workload is created per static HTML5 game.

## Platform connection

The platform catalogue records:

- stable game ID and slug;
- active immutable version;
- controlled-origin entry point;
- free or Game Arena+ eligibility;
- orientation and device tier;
- Game Bridge version;
- score, duration and completion-integrity policy;
- rewards eligibility;
- rollout percentage;
- pause/kill-switch status.

The player API issues the existing play nonce and loads the controlled-origin version in the iframe. Legacy external `games.codistan.org` URLs remain disabled in production after migration.

Games that cannot yet report trusted lifecycle/score events may launch as play-only titles with rewards, competitions and valuable progression disabled until their Bridge integration is certified.

## Backup and recovery

Maintain three copies:

1. Local working master on the operator PC.
2. Private GitHub repository and immutable release assets.
3. Private encrypted S3 source archive with versioning and archival lifecycle.

For each source release, verify that the SHA-256 checksum matches across all copies. Perform a quarterly restore test for at least one game and an annual restore sample across the portfolio.

## Migration sequence

### Pilot

Use three titles:

- Duck Hunter as the first baseline;
- one portrait game;
- one media-heavy game.

The pilot proves source conversion, repository automation, release snapshots, scanner behavior, Game Bridge integration, S3 publication, CloudFront delivery, catalogue activation and rollback.

### Portfolio import

After the pilot passes, process the 60 games in batches of ten. A local migration tool will:

- detect `Original` and `Modified` folders;
- normalize title and slug;
- inventory Construct 2, Construct 3, HTML5, Android/iOS, documentation and icons;
- calculate hashes;
- convert `.c3p` to a folder project where possible;
- create repository-ready source trees;
- produce source snapshot archives and release metadata;
- generate the platform import manifest;
- flag missing entry points, dependencies, network calls and unsafe files.

### Launch rollout

Publish in small controlled batches. Start with three to five games, certify them, then expand. Do not activate all 60 at once.

## Cost controls

- Self-hosted GitHub Actions avoids hosted-runner minute charges.
- Private source repositories remain small by excluding generated builds.
- Git LFS is limited to editable binary assets and stays below the free organization allowance.
- GitHub Releases hold immutable source snapshots without bloating Git history.
- One S3 bucket and one CloudFront distribution serve all static games.
- Versioned paths use long immutable cache headers.
- Source archives transition to low-cost archival storage.
- CloudFront usage and AWS budgets/alerts are enabled before public launch.

## Security and legal controls

- All source repositories are private.
- No signed rights agreements are committed; repositories store only a reference and approval status.
- Source archives and buckets are encrypted and block public access.
- Publication uses short-lived GitHub OIDC credentials and a restricted game-publish role.
- Immutable versions cannot be overwritten.
- Every version has a checksum, provenance record, scanner result and rollback path.
- Rights approval remains mandatory before production publication.

## Delivery tracks

- Source/rights and roster: #73
- Import and controlled-origin publication: #74
- Gameplay/device/integrity certification: #75
- Parent launch gate: #40
- AWS staging and evidence: #48
