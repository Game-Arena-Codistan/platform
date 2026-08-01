# Free self-hosted CI/CD

Game Arena uses a dedicated organization-level Linux x64 self-hosted runner so private-repository Actions do not depend on GitHub-hosted minutes.

## Architecture

| Workflow | Trigger | Purpose |
|---|---|---|
| `Platform CI` | Pull requests, manual | Fast required repository, API, player, admin, game and configuration checks |
| `Platform Qualification` | `main`, manual | PostgreSQL, load, containers, browsers, OpenTofu and CodeQL |
| `Runner Smoke` | Manual | Proves the runner host and toolchain |
| AWS workflows | Manual/protected | Infrastructure, deployment, runtime controls, rollback and game publication |

Every job routes through:

```yaml
runs-on: [self-hosted, linux, x64, game-arena-ci]
```

The four labels are cumulative. A runner must have all four to receive a job.

## Human-owned runner registration

Organization runner management:

https://github.com/organizations/Game-Arena-Codistan/settings/actions/runners

Add Linux x64 runner:

https://github.com/organizations/Game-Arena-Codistan/settings/actions/runners/new

Use:

- Runner name: `game-arena-ci-01`
- Custom label: `game-arena-ci`
- Work folder: `_work`
- Access: selected private repositories only

Run GitHub's current registration commands inside the dedicated Ubuntu/WSL2 runner account. Do not copy the temporary registration token into repository files, issue comments, chat or screenshots.

## Host prerequisites

- Supported Ubuntu under WSL2 or a dedicated Linux host
- Node.js major 22
- Docker daemon and Compose v2
- OpenTofu exactly 1.12.5
- Git, curl, jq, zip and unzip
- At least 10 GiB free working storage

The repository helper installs Linux browser/system packages:

```bash
bash scripts/bootstrap-self-hosted-runner.sh
```

After installing Node, Docker and OpenTofu, verify locally:

```bash
bash scripts/check-self-hosted-runner.sh
```

Then register the runner and run `Runner Smoke` from:

https://github.com/Game-Arena-Codistan/platform/actions/workflows/runner-smoke.yml

## Security boundary

- Private Game Arena repositories only
- No public-fork pull requests
- Dedicated Linux account without personal files or browser sessions
- No long-lived AWS keys
- GitHub OIDC for AWS jobs
- Read-only default `GITHUB_TOKEN`; elevate only in explicit jobs
- No secrets in pull-request CI
- Workspace and run-labelled Docker resources cleaned after every job

Self-hosted runners are not fresh virtual machines. The cleanup script is mandatory, and the host must receive OS, Docker, Node, OpenTofu and runner-agent maintenance.

## Branch protection

After both new workflows have passed on a real pull request:

1. Require `Platform CI / platform-ci`.
2. Remove obsolete hosted check names.
3. Keep pull requests, resolved conversations, no force pushes and squash merge.
4. Use the local validator only for documented GitHub control-plane or runner outages, never to override a genuine failed test.

Repository settings:

- Rules: https://github.com/Game-Arena-Codistan/platform/settings/rules
- Branches: https://github.com/Game-Arena-Codistan/platform/settings/branches
- Actions: https://github.com/Game-Arena-Codistan/platform/settings/actions
- Environments: https://github.com/Game-Arena-Codistan/platform/settings/environments

## Operations

The host must be online for workflows to start. One runner executes one job at a time; queued jobs wait.

Routine checks:

```bash
cd /path/to/actions-runner
sudo ./svc.sh status
journalctl -u 'actions.runner.*' --since today
docker system df
df -h
```

Use `Runner Smoke` after restarts and upgrades. For compromise, remove the runner from the organization, revoke affected credentials/sessions, rebuild the Linux environment and register a new runner identity.

## AWS deployment

AWS workflows remain manual and protected. They must use OIDC, expected-account checks, `ap-south-1`, immutable references and environment concurrency. The runner stores no AWS access key or secret key.
