# Dependency reproducibility

The API, player web build and browser qualification projects each commit an npm lockfile generated with Node.js 22.22.0 on GitHub-hosted Linux runners.

Release-critical workflows and the API production image use `npm ci`; dependency updates are proposed through Dependabot and must pass the full pull-request matrix. Production container base images are pinned to reviewed linux/amd64 publisher manifest digests, while release images remain commit-addressed and include SBOM and provenance metadata.

The lockfiles were regenerated and verified with a clean `npm ci` for all three projects immediately before the staging-ready release candidate was finalized.
