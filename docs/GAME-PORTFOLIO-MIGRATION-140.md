# One-time migration plan for 140 local games

## Objective

Move the current local 140-game portfolio into the scalable source, backup, catalogue and controlled-origin architecture without manually creating or publishing each title and without placing multi-gigabyte archives in Git history.

The migration is resumable, evidence-producing and safe to rerun. A failed title does not block the rest of the portfolio.

## Source boundary

Expected local inputs may include:

```text
<portfolio-root>/
  Original/
  Modified/
  <number>.<Game Title>/
    Construct 2/
    Construct 3/
    HTML5/
    Android & IOS/
    Documentation/
    Icons/
    *.c3p
    *.zip
```

The tool must tolerate inconsistent folder names and partial games. It never deletes or modifies the original source tree.

## Migration outputs

For each discovered game, produce:

1. a stable slug and internal game ID;
2. complete local inventory and classification;
3. SHA-256 source and build checksums;
4. immutable source-vault packages;
5. a source-shard GitHub folder containing reviewable source and manifests;
6. a catalogue record and rights placeholder/reference;
7. a normalized deployable HTML5 build when available;
8. scanner and network-call reports;
9. controlled-origin release metadata;
10. certification and activation status.

## Portfolio status model

Every title receives one migration state:

```text
discovered
inventoried
rights-pending
source-backed-up
source-reviewable
build-ready
scan-blocked
bridge-pending
staging-published
certification-pending
certified
active
retired
```

A generated portfolio dashboard summarizes counts and blockers by state, engine, runtime class and batch.

## Phase 0 — Freeze and protect the local source

- Treat the existing local bundle as read-only.
- Record the root path, total bytes, file count and collection timestamp.
- Create a second local/offline copy before any conversion.
- Do not edit files inside the original folders.
- Run all conversion and build work in a separate migration workspace.

Deliverables:

```text
portfolio-root-manifest.json
portfolio-root-checksums.sha256
migration-config.json
```

## Phase 1 — Automated discovery and inventory

Build a Windows-compatible `game-portfolio` CLI in the platform repository.

The discovery command scans the local root and detects:

- title and numbered folder prefix;
- `Original` and `Modified` variants;
- Construct 2 and Construct 3 source;
- `.c3p` and folder projects;
- HTML5 ZIPs and expanded builds;
- `index.html` entry points;
- Android/iOS packages;
- documentation and icons;
- duplicate archives and duplicate game content;
- executable/server-side files;
- hard-coded external links and network endpoints;
- service workers, manifests and offline files;
- file count, compressed/uncompressed size and media weight.

Output:

```text
migration/inventory/<slug>.json
migration/portfolio.csv
migration/duplicates.json
migration/blockers.json
```

No upload occurs during discovery.

## Phase 2 — Classification and migration batches

Classify each title by:

- engine: Construct 2, Construct 3, custom HTML5, unknown;
- source completeness: full source, modified source, build-only;
- runtime: static, static-with-external-API, realtime/server-backed;
- orientation and device requirements;
- bridge readiness;
- rights status;
- build readiness;
- risk level.

Create migration batches based on technical similarity, not alphabetical order.

Recommended order:

1. **Pilot batch — 5 games**
   - Duck Hunter;
   - one Construct 2 title;
   - one Construct 3 title;
   - one portrait title;
   - one media-heavy title.
2. **Low-risk static batch — 20 games**
3. **Remaining static Construct batches — 20 games each**
4. **Build-only or repair-required batch**
5. **External API/realtime batch**

The 140-game migration therefore proceeds as one pilot plus controlled batches, not 140 independent manual projects.

## Phase 3 — Source vault upload

For each title, create deterministic archives in the migration workspace:

```text
<slug>/sources/<source-version>/original-source.zip
<slug>/sources/<source-version>/modified-source.zip
<slug>/sources/<source-version>/modified-html5.zip
<slug>/sources/<source-version>/inventory.json
<slug>/sources/<source-version>/checksums.sha256
<slug>/sources/<source-version>/provenance.json
```

Upload directly from the Windows machine to the private source-vault bucket using multipart/resumable transfer.

Requirements:

- checkpoint after every object;
- skip objects already present with matching checksum;
- fail on checksum mismatch;
- bounded parallel uploads;
- automatic retry with exponential backoff;
- no GitHub Actions artifact relay;
- no source archives committed to Git;
- upload report contains only non-sensitive metadata.

After verification, approved originals receive governance retention and lifecycle rules.

## Phase 4 — Reviewable GitHub source import

Create the source shard repositories once, then import games into the correct shard based on engine and size.

For every title:

- convert Construct 3 `.c3p` to folder form when safe;
- include reviewable JSON, scripts and small assets;
- exclude generated exports, dependency folders and large archives;
- write `game.yaml`, `README.md` and `RIGHTS-REFERENCE.md`;
- write the source-vault object keys and SHA-256 hashes;
- add path-specific ownership and CI;
- create one migration PR per batch, not one PR per file;
- use sparse checkout for later development.

Large binary assets required for active editing may use Git LFS selectively. The full portfolio does not depend on Git LFS for backup.

## Phase 5 — Catalogue import

Create one catalogue entry per discovered title, even when it is not launch-ready.

Minimum record:

```yaml
slug: duck-hunter
title: Duck Hunter
sourceClass: full-source
runtimeClass: static
engine: construct3
rightsStatus: pending
migrationStatus: source-backed-up
activeVersion: null
freePremiumEligibility: undecided
```

The catalogue repository records blockers without exposing source archives or signed rights documents.

The 16 currently missing platform catalogue titles are added during this phase, but remain inactive until publication and certification.

## Phase 6 — Build normalization

For each launch candidate:

- select the modified HTML5 build or export from approved source;
- require one canonical `index.html`;
- normalize the top-level folder layout;
- remove prohibited outbound links, share buttons and unrelated cross-promotion where permitted;
- preserve required licenses and attributions;
- identify hard-coded hostnames and external APIs;
- add or validate the Game Bridge adapter;
- disable rewards/competitions for titles without trustworthy completion signals;
- generate a deterministic version and build digest;
- package the canonical ZIP.

The normalized build is written to the isolated workspace and source vault, never directly to the platform repository.

## Phase 7 — Automated scanning and browser pre-certification

Run the existing archive and static scanner plus portfolio checks:

- path traversal and symlink rejection;
- encrypted/corrupt ZIP detection;
- compressed and uncompressed size limits;
- blocked executables and server files;
- dependency and source-control directory rejection;
- external network/domain inventory;
- active SVG and unsafe HTML checks;
- service-worker scope review;
- console error capture;
- Chromium smoke launch;
- portrait and landscape viewport checks;
- load time and transferred-byte measurement;
- screenshot and basic interaction evidence.

Generate a machine-readable result for every title. Failures are quarantined; successful titles continue.

## Phase 8 — Staging publication

Publish approved builds to the staging artifact bucket through the protected publication role:

```text
games/<slug>/<version>/
```

For each published version:

- reject overwrite of an existing immutable version;
- verify the uploaded manifest and checksum;
- record CloudFront URL and digest;
- open a metadata-only catalogue PR;
- keep rollout at zero until review;
- keep the legacy hosted URL as a temporary comparison target only.

Publication runs by batch with a configurable concurrency limit so the single self-hosted runner and local network remain stable.

## Phase 9 — Certification

Use two layers:

### Automated certification for all 140

- load and basic interaction;
- console and network errors;
- mobile/desktop viewport;
- pause/resume and exit;
- Game Bridge readiness;
- performance envelope;
- security headers and controlled origin;
- kill switch and rollback metadata.

### Human certification per launch title

- complete gameplay loop;
- controls, audio and orientation;
- score/duration/completion integrity;
- supported Android and iPhone devices;
- reward and premium eligibility;
- slow/interrupted network behavior;
- rights and branding confirmation;
- go/no-go result.

A title may remain in the catalogue but inactive until human certification is complete.

## Phase 10 — Controlled activation

Activate certified titles in progressive batches:

```text
internal only
1% rollout
10% rollout
25% rollout
50% rollout
100% rollout
```

At each stage monitor:

- launch success rate;
- client errors;
- transferred bytes and CDN cache hit rate;
- average session duration;
- reward/integrity anomalies;
- support reports.

Rollback changes the active catalogue pointer; it does not overwrite or delete an immutable build.

## Phase 11 — Closeout and legacy-host transition

- Verify all source-vault objects and catalogue records.
- Complete a restore drill from archived source for at least three representative games.
- Compare controlled-origin behavior to the legacy host.
- Keep legacy hosting until launch parity and rollback confidence are recorded.
- Remove or disable legacy URLs only after approved migration completion.
- Produce the final 140-game migration evidence pack for #40 and #48.

## Tooling deliverables

The execution implementation will add:

```text
apps/game-ops/src/portfolio-discover.mjs
apps/game-ops/src/portfolio-archive.mjs
apps/game-ops/src/portfolio-source-import.mjs
apps/game-ops/src/portfolio-build.mjs
apps/game-ops/src/portfolio-publish.mjs
apps/game-ops/src/portfolio-status.mjs
scripts/Invoke-GamePortfolioMigration.ps1
schemas/game-source.schema.json
schemas/game-catalogue.schema.json
```

The PowerShell entrypoint will accept the local root path, batch ID and mode, and will preserve a local checkpoint directory so execution can stop and resume safely.

## Acceptance criteria

The one-time migration is complete when:

- all 140 titles are discovered and uniquely identified;
- every title has source-vault backup or a documented missing-source blocker;
- reviewable source is imported into an appropriate shard where available;
- every title has a catalogue record and rights state;
- every launch candidate has an immutable staging build and scan result;
- certified titles are connected to the platform through controlled-origin versions;
- failed titles are quarantined with explicit blockers;
- restore, pause and rollback have been demonstrated;
- no game archive or expanded binary has entered platform Git history.

## GitHub tracking

- Scalable architecture: #77
- 140-game migration execution: #78
- Source and rights roster: #73
- Import and platform connection: #74
- Certification: #75
- Parent launch gate: #40
- AWS staging evidence: #48
