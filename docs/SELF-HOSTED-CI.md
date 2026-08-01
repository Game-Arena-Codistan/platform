# Game Arena self-hosted CI

Game Arena can run its repository and release checks on one dedicated Windows x64 machine without long-lived cloud credentials or GitHub-hosted runner minutes.

## Safety state

The optional workflows remain disabled unless the repository variable below is exactly `true`:

`SELF_HOSTED_CI_ENABLED`

Keep the variable absent or `false` until the runner is registered, private-repository restricted and ready for smoke qualification. Existing hosted workflows remain authoritative until the replacement checks pass on a real pull request and branch protection is deliberately updated.

## Required host

- Dedicated Windows x64 computer or VM.
- Runner name: `game-arena-ci-01`.
- Labels: `self-hosted`, `windows`, `x64`, `game-arena-ci`.
- Git for Windows with Git Bash.
- Node.js 22.
- Docker Desktop using Linux containers.
- OpenTofu 1.12.5.
- `jq`, `curl`, Git and npm available in Git Bash.
- At least 10 GiB free in the runner workspace.
- No personal browser profile, SSH key, cloud key or unrelated source checkout in the runner account.

The runner requires outbound HTTPS. Do not expose an inbound administration port.

## Registration

1. In the GitHub organization, create a runner group restricted to selected private Game Arena repositories.
2. Open the organization **New self-hosted runner** page and select Windows x64.
3. Download the official runner archive. Do not paste the temporary registration token into GitHub issues, chat, files or shell history.
4. Start Administrator PowerShell.
5. Run:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\register-game-arena-runner.ps1 -RunnerArchive 'C:\path\to\actions-runner-win-x64.zip'
```

The script prompts securely for the temporary token, registers the runner as a Windows service, applies the `game-arena-ci` custom label and clears the plaintext token from memory after use.

6. Verify the organization page shows `game-arena-ci-01` as online and idle.
7. Confirm runner-group access includes only intended private repositories.

## Activation and qualification

1. Set repository variable `SELF_HOSTED_CI_ENABLED=true`.
2. Manually dispatch **Runner Smoke**.
3. Confirm it proves:
   - Node 22;
   - Docker Desktop Linux containers;
   - PostgreSQL 16 startup and SQL execution;
   - Playwright/Chromium tooling;
   - OpenTofu provider initialization and validation;
   - scoped cleanup.
4. Open or update a real pull request and require **Platform CI / platform-ci** to pass.
5. Apply the `launch-gate` label or manually dispatch **Platform Qualification**.
6. Preserve the qualification artifact and run URLs in issues #67, #68, #69, #71 and #48.
7. Only then update branch protection to require the stable self-hosted check and remove obsolete hosted check names.

If smoke or qualification fails, immediately set `SELF_HOSTED_CI_ENABLED=false` while fixing the runner. Do not use a local green run to override a real repository test failure.

## Workflow model

### Platform CI

Fast pull-request gate covering repository security, pre-staging controls, API contract, normalized PostgreSQL/report routing, API, player, game operations, Game Bridge, administration, Compose configuration and Kubernetes rendering. Superseded pull-request runs are cancelled.

### Platform Qualification

Heavy sequential release gate covering PostgreSQL 16 migrations, durability, concurrency, indexed reporting, API load, the full Compose stack, Chromium/Firefox/WebKit, OpenTofu and CodeQL security-extended analysis. Heavy runs do not cancel an active qualification.

### Runner Smoke

Manual host and tool validation. It does not deploy an environment and receives no AWS/provider secrets.

AWS infrastructure, application deployment, runtime controls and game publication remain separate protected manual workflows using GitHub OIDC. No long-lived AWS access keys are permitted on the runner.

## Persistent-runner hygiene

Every self-hosted job:

- verifies the machine before executing repository work;
- labels disposable Docker resources with the GitHub run ID;
- removes only resources belonging to that run;
- deletes test reports, traces and generated data;
- resets and cleans the checkout;
- runs cleanup under `always()` without masking the original job result.

Do not run public-repository or public-fork workloads on this machine.

## Routine operations

Before each release and monthly:

- verify the service is running and the runner is online/idle;
- install supported runner-agent updates;
- update Windows, Git, Docker Desktop and Node 22 security releases;
- keep OpenTofu pinned at 1.12.5 until a reviewed infrastructure update changes it;
- review free disk space, Docker images/volumes and Playwright browser storage;
- dispatch Runner Smoke after host restart or tool upgrade;
- verify runner-group repository access and absence of personal/cloud credentials.

## Incident response

### Runner offline

Check host power/network, Docker Desktop and the Windows runner service. Restart the service and dispatch Runner Smoke. Re-register only if the identity is genuinely lost.

### Stuck job

Cancel the run, confirm no AWS deployment is active and remove only containers/networks/volumes carrying that run ID label.

### Disk pressure

Disable the repository variable, stop new jobs, remove expired workspaces and disposable Docker resources, then re-enable only after Runner Smoke passes.

### Suspected compromise or secret exposure

Disable the repository variable, remove the runner from the organization, revoke affected sessions/credentials, preserve logs, rebuild the machine from a clean image and register with a new temporary token.

## Human-owned settings still required

Repository code cannot perform these organization/account actions:

- register and keep the physical runner online;
- restrict the runner group to private repositories;
- set `SELF_HOSTED_CI_ENABLED`;
- change branch protection required checks;
- protect `staging` and `production` environments;
- approve AWS OIDC role/environment settings.

Record non-sensitive evidence in the corresponding issues. Never record registration tokens, credentials, private keys or customer data.
