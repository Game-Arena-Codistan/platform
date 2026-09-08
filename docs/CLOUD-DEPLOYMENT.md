# Deployment targets

## Active target

Game Arena currently deploys to the existing **self-managed/local-server Docker Compose staging environment**.

Use:

- `docs/DEPLOYMENT.md` for the active staging/recovery sequence;
- `docs/DEPLOYMENT-HANDOFF.md` for developer takeover;
- `infra/docker-compose.staging.yml` for the active staging stack;
- `.github/workflows/release.yml` for immutable image publication;
- `.github/workflows/deploy.yml` for staging deployment and certification;
- issue #48 for the current exact release and launch-gate status.

The staging URL is `https://gsmarena-play.codistan.org`.

## Historical/optional cloud lane

The repository still contains Kubernetes/OpenTofu/AWS workflows and documentation from an earlier managed-cloud architecture. They are retained for reference or a possible future infrastructure decision.

They are **not required** for the current launch. Do not provision AWS/EKS/S3/RDS/IAM/Route 53 solely because those files exist.

`docs/AWS-DEPLOYMENT.md` and `docs/AWS-STAGING-ACCOUNT-INTAKE.md` are explicitly historical/optional. Re-activate them only after a separate approved infrastructure decision and a fresh review of cost, security, secrets and migration impact.

Frontend preview deployments are not staging evidence. Current staging evidence comes from the self-managed Compose deployment and automated certification recorded under #48.