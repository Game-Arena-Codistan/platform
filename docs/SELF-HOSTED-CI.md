# Free self-hosted CI/CD

Game Arena uses the existing Windows computer as an organization-level self-hosted runner. Docker Desktop continues to provide Linux containers for PostgreSQL and production image builds. No Ubuntu distribution or second operating system is required.

## Architecture

| Workflow | Trigger | Purpose |
|---|---|---|
| `Platform CI` | Pull requests, manual | Fast required repository, API, player, admin, game and configuration checks |
| `Platform Qualification` | Launch-gate pull requests, `main`, manual | PostgreSQL, load, containers, browsers, OpenTofu and CodeQL |
| `Runner Smoke` | Manual | Proves the Windows host, Docker Desktop and toolchain |
| AWS workflows | Manual/protected | Infrastructure, deployment, runtime controls, rollback and game publication |

Routine jobs route through:

```yaml
runs-on: [self-hosted, windows, x64, game-arena-ci]
```

## Runner registration

Open:

https://github.com/organizations/Game-Arena-Codistan/settings/actions/runners/new

Choose:

- Operating system: `Windows`
- Architecture: `x64`
- Runner name: `game-arena-ci-01`
- Custom label: `game-arena-ci`
- Work folder: `_work`
- Access: selected private repositories only

Run GitHub's current commands in an Administrator PowerShell window. Do not copy the temporary registration token into repository files, issue comments, chat or screenshots.

## Prerequisites

- Windows 10 or Windows 11
- PowerShell 5.1 or newer
- Git for Windows, including Git Bash
- Node.js major 22
- Docker Desktop running Linux containers
- Docker Compose v2
- OpenTofu exactly 1.12.5
- `jq`, `curl`, `zip` and `unzip`
- At least 10 GiB free storage

Validate the existing machine before registration:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/bootstrap-self-hosted-runner.ps1
```

After registration, run `Runner Smoke`:

https://github.com/Game-Arena-Codistan/platform/actions/workflows/runner-smoke.yml

## Security boundary

- Private Game Arena repositories only
- No public-fork pull requests
- Dedicated runner directory without personal files or unrelated credentials
- No long-lived AWS keys
- GitHub OIDC for AWS jobs
- Read-only default `GITHUB_TOKEN`; elevate only in explicit jobs
- No secrets in pull-request CI
- Workspace and run-labelled Docker resources cleaned after every job

## Branch protection

After the Windows runner checks pass:

1. Require `Platform CI / platform-ci`.
2. Remove obsolete hosted check names.
3. Keep pull requests, resolved conversations, no force pushes and squash merge.
4. Use the local validator only for a documented GitHub or runner outage, never to override a genuine failed test.

Settings:

- Rules: https://github.com/Game-Arena-Codistan/platform/settings/rules
- Branches: https://github.com/Game-Arena-Codistan/platform/settings/branches
- Actions: https://github.com/Game-Arena-Codistan/platform/settings/actions
- Environments: https://github.com/Game-Arena-Codistan/platform/settings/environments

## Operations

The Windows computer and Docker Desktop must be running for jobs to start. One runner executes one job at a time.

Use Windows Services or the runner's `svc.cmd` commands to start, stop and inspect the service. Run `Runner Smoke` after Windows, Docker Desktop, Node, OpenTofu or runner-agent updates.

## AWS deployment

AWS infrastructure and control workflows use the Windows runner and Git Bash. They remain manual, protected and OIDC-only. The large reusable deployment workflow receives its final Windows execution qualification during the AWS staging phase before any apply or application deployment is approved.
