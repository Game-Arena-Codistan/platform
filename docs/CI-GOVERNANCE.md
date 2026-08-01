# CI governance and emergency qualification

## Normal merge path

1. `Platform CI / platform-ci` passes on the current pull-request head.
2. Review conversations are resolved.
3. The pull request is squash-merged.
4. `Platform Qualification / platform-qualification` passes on the merged `main` SHA before staging promotion.
5. Release evidence records the immutable SHA and workflow URLs.

## Emergency local exception

The complete local validator may substitute temporarily only when GitHub Actions cannot dispatch work or the organization runner is unavailable.

Required evidence:

- immutable PR head SHA;
- `validation-summary.md`;
- evidence ZIP;
- Node, Docker and OpenTofu versions;
- GitHub job metadata proving repository steps did not execute, or runner outage evidence;
- owner approval recorded on the pull request.

The exception is prohibited when a self-hosted workflow executed repository code and failed. The same SHA must be rerun through `Platform Qualification` when service returns.

## Required settings

- Pull requests required for `main`
- `Platform CI / platform-ci` required
- Resolved conversations required
- Force pushes and branch deletion disabled
- Squash merge used
- Default workflow token read-only
- Runner access limited to selected private repositories
- `staging` and `production` GitHub Environments protect AWS jobs
- No long-lived AWS credentials

## Human settings links

- Organization Actions: https://github.com/organizations/Game-Arena-Codistan/settings/actions
- Organization runners: https://github.com/organizations/Game-Arena-Codistan/settings/actions/runners
- Repository Actions: https://github.com/Game-Arena-Codistan/platform/settings/actions
- Repository rules: https://github.com/Game-Arena-Codistan/platform/settings/rules
- Repository branches: https://github.com/Game-Arena-Codistan/platform/settings/branches
- Repository environments: https://github.com/Game-Arena-Codistan/platform/settings/environments
