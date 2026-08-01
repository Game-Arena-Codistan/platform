# Game portfolio source, backup and delivery architecture

## Scope

This decision supports the current local portfolio, the first 140-game migration, and a future catalogue of 300–500 games without creating one repository, server, container, or deployment pipeline per static game.

## Final decision

Use five separated planes:

1. **Platform application** — `Game-Arena-Codistan/platform` remains the player, API, admin, payments, entitlement, game-bridge and deployment repository.
2. **Catalogue control plane** — a private `Game-Arena-Codistan/game-catalogue` repository stores reviewable metadata, rights references, release manifests, certification results and desired active versions. It stores no game binaries.
3. **Maintainable source plane** — a small set of private, engine-based source repositories stores reviewable Construct/JavaScript source and small assets. Repositories are sharded by engine and size rather than created one per title.
4. **Durable source vault** — a private encrypted S3 bucket stores complete original and modified source packages as immutable, content-addressed archives.
5. **Runtime delivery plane** — a separate private S3 artifact bucket and one CloudFront distribution deliver immutable HTML5 builds from the controlled game origin.

The platform database remains the runtime source of truth for active version, eligibility, rollout and pause state. GitHub is the review and change-control system. S3 is the binary source vault and delivery store.

## Why the previous one-repository-per-game model is replaced

One private repository per title is manageable for a small portfolio, but at 300–500 titles it creates hundreds of repositories, duplicated workflow files, permission surfaces, Dependabot queues, settings, release pages and administrative operations.

A single binary-heavy monorepo is also rejected because clone performance, Git history and CI checkout size would degrade as the portfolio grows.

The selected hybrid model keeps the number of repositories low while retaining per-game isolation through folders, manifests, ownership and sparse checkout.

## Repository topology

### Platform repository

`Game-Arena-Codistan/platform`

Contains:

- player, API and admin code;
- game ingestion and scanner tooling;
- Game Bridge contracts;
- deployment automation;
- database migrations and runtime catalogue APIs;
- no original archives, HTML5 ZIPs or expanded game binaries.

### Catalogue repository

`Game-Arena-Codistan/game-catalogue`

Recommended layout:

```text
/games/<slug>/game.yaml
/games/<slug>/rights.yaml
/games/<slug>/releases/<version>.json
/games/<slug>/certifications/<version>.json
/batches/<batch-id>.yaml
/schemas/
/tools/
```

The catalogue repository is small, auditable and safe to clone. A reviewed catalogue release produces a signed snapshot consumed by the platform deployment and reconciled into normalized PostgreSQL tables.

### Source repositories

Create engine-based shards rather than one repository per game:

```text
Game-Arena-Codistan/games-construct2-001
Game-Arena-Codistan/games-construct2-002
Game-Arena-Codistan/games-construct3-001
Game-Arena-Codistan/games-html5-custom-001
```

Shard rules:

- target 15–25 games per repository;
- create a new shard before the repository approaches 2 GB of Git objects or 25 active titles;
- never exceed the repository health limits defined by GitHub;
- use one top-level folder per game;
- use sparse checkout so developers and CI hydrate only the selected title;
- use CODEOWNERS and path-filtered CI;
- split an individual game into its own repository only when it becomes a high-change product with a dedicated team or independent release cadence.

Recommended game folder:

```text
/games/<slug>/game.yaml
/games/<slug>/README.md
/games/<slug>/RIGHTS-REFERENCE.md
/games/<slug>/source/construct3/
/games/<slug>/source/construct2/
/games/<slug>/source/scripts/
/games/<slug>/source/small-assets/
/games/<slug>/patches/
/games/<slug>/tests/
```

Construct 3 `.c3p` projects should be converted to folder projects when possible so JSON and scripts are reviewable. Generated exports, Android/iOS packages, dependency folders and deployable ZIPs do not enter Git history.

## Binary and Git LFS policy

Git LFS is not the portfolio backup system.

Use it only for actively edited binary assets that must participate in normal source checkout. Keep the organization LFS budget capped and monitored. The free organization allowance is too small to hold the full binary history of hundreds of games.

Complete source packages, generated builds, media bundles and mobile exports are stored in S3. Every Git-tracked game contains a source manifest that records the SHA-256 hashes and vault object keys required to hydrate the full project.

A local `game-portfolio` CLI will support:

```text
game-portfolio hydrate <slug>
game-portfolio verify <slug>
game-portfolio archive <slug>
game-portfolio build <slug>
```

## Durable source vault

Use a dedicated bucket separate from runtime artifacts:

```text
s3://<source-vault>/games/<slug>/sources/<source-version>/
```

Each source version contains:

```text
original-source.zip
modified-source.zip
modified-html5.zip
inventory.json
checksums.sha256
provenance.json
```

Controls:

- Block Public Access;
- versioning enabled;
- encryption enabled, with S3 Bucket Keys when KMS is used;
- Object Lock governance retention for approved original baselines;
- multipart and resumable upload;
- SHA-256 verification after upload;
- lifecycle transition of cold source versions to Glacier storage;
- no public or application-runtime read permission;
- quarterly restore test and annual portfolio restore sample.

S3 is the authoritative complete binary backup. GitHub stores reviewable source, manifests and history rather than becoming a multi-hundred-gigabyte binary vault.

## Runtime artifact delivery

Static games share one runtime architecture:

```text
s3://<game-artifacts>/games/<slug>/<version>/...
https://<controlled-game-host>/games/<slug>/<version>/index.html
```

Controls:

- private S3 origin behind CloudFront Origin Access Control;
- immutable version paths;
- long cache headers for versioned assets;
- short cache only for catalogue pointers/manifests;
- WAF and response security headers at the edge;
- no public S3 bucket;
- no server or Kubernetes workload per static game;
- older approved versions retained for rollback and moved to lower-cost storage when cold.

Server-backed and realtime titles are a separate runtime class. They use reusable backend services and explicit API contracts; they are never silently treated as static uploads.

## Runtime catalogue and platform connection

The normalized runtime model must support at least:

- stable game ID and slug;
- source class and runtime class;
- active immutable version and manifest digest;
- controlled-origin entrypoint;
- free or Game Arena+ eligibility;
- orientation and minimum device tier;
- Game Bridge version and supported events;
- score, duration and completion integrity policy;
- rewards and competition eligibility;
- rollout percentage;
- pause, kill-switch and retirement state;
- rights approval reference;
- certification state;
- release provenance and checksums.

The API issues the existing play nonce and resolves the active controlled-origin release. Catalogue search and admin screens are paginated and filterable so 500 titles do not load as one static JavaScript array.

Legacy `games.codistan.org` URLs remain a temporary migration source only. Production activation uses controlled-origin immutable releases.

## Publication flow

1. Register the title and rights reference in the catalogue repository.
2. Archive and verify original/modified source into the source vault.
3. Hydrate one title into an isolated workspace.
4. Produce or select the modified HTML5 build.
5. Run archive preflight, dependency/static scanning and network-call classification.
6. Add or validate the Game Bridge adapter.
7. Generate immutable build manifest, checksums and provenance.
8. Run automated browser and runtime qualification.
9. Publish to the artifact bucket through the protected game-publish role.
10. Open a metadata-only review PR in the catalogue repository.
11. Reconcile the approved release into platform PostgreSQL.
12. Activate gradually with pause and rollback available.

## CI and operational scaling

- Routine platform CI never downloads the whole game portfolio.
- Source CI runs only for changed game paths.
- Bulk migration runs on the self-hosted Windows machine with resumable checkpoints.
- Large source uploads go directly from the operator machine to S3, not through GitHub Actions artifacts.
- GitHub Actions carries metadata, logs and small evidence only.
- Scanner and browser jobs are batched and resumable.
- Concurrency is limited so one self-hosted runner remains stable.
- Portfolio status is tracked by generated batch manifests rather than hundreds of manual checklists.

## Retention policy

- Original source baseline: retain indefinitely.
- Approved modified source releases: retain indefinitely or according to legal policy.
- Failed/unapproved working packages: retain temporarily, then expire.
- Current runtime version and last two healthy versions: hot storage for immediate rollback.
- Older runtime versions: transition to lower-cost storage after the rollback window.
- Logs and browser evidence: bounded retention with non-sensitive summaries retained in GitHub.

## Cost model

The low-cost design depends on separation:

- GitHub stores text, manifests and selective active-development assets.
- S3 stores large source and build objects.
- Glacier classes store cold originals and historical source versions.
- CloudFront caches static games globally.
- One artifact bucket and one distribution serve hundreds of games.
- No per-game compute is created for static titles.
- GitHub-hosted runner minutes and large Actions artifact storage are avoided.
- AWS budgets, storage metrics and CloudFront usage alarms are mandatory before public rollout.

## Security and rights

- Source and catalogue repositories are private.
- Signed agreements are not committed; only non-sensitive references and approval state are recorded.
- Source vault and artifact buckets use separate IAM roles.
- Publication uses short-lived GitHub OIDC credentials.
- Source upload permission does not grant public publication permission.
- Immutable runtime versions cannot be overwritten.
- Every version has checksums, provenance, scan result and rollback record.
- Rights approval remains mandatory before public activation.

## Scale checkpoints

Review the architecture at these thresholds:

- 140 titles: complete first migration and measure storage, scan duration and certification throughput.
- 300 titles: verify catalogue/API pagination, shard sizes, CloudFront cost and admin performance.
- 500 titles: verify source-vault inventory, restore sampling, rights coverage, automated certification coverage and operational staffing.

## Delivery tracks

- Scalable portfolio architecture: #77
- One-time 140-game migration: #78
- Source/rights roster: #73
- Import and controlled-origin publication: #74
- Gameplay/device/integrity certification: #75
- Parent launch gate: #40
- AWS staging and evidence: #48
