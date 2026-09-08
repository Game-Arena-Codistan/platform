# Historical/optional AWS deployment lane

> **Current status: NOT ACTIVE FOR THE CURRENT GAME ARENA LAUNCH.**
>
> Game Arena currently uses the existing self-managed/local-server Docker Compose staging path. AWS/EKS/S3/OpenTofu provisioning is not required for staging UAT or production approval under the current scope.

This file is retained only as an architectural record for a possible future managed-cloud migration.

## Do not use this as the current deployment runbook

For the active deployment path use:

- `docs/DEPLOYMENT.md`
- `docs/DEPLOYMENT-HANDOFF.md`
- `infra/docker-compose.staging.yml`
- `.github/workflows/deploy.yml`
- issue #48

Do **not** create or request any of the following for the current launch merely because historical workflows reference them:

- `AWS_INFRA_ROLE_ARN`
- `AWS_DEPLOY_ROLE_ARN`
- AWS account/state bootstrap
- EKS clusters
- RDS
- ECR
- S3 source-vault/evidence buckets
- Route 53 / ACM resources
- AWS Secrets Manager / SSM configuration

Issue #141 was explicitly closed as deferred/non-blocking for the local-server launch.

## Historical design summary

The prior managed-cloud design used OpenTofu to describe isolated AWS environments with VPC, EKS, RDS PostgreSQL, ECR, ACM/Route 53, Secrets Manager/SSM and encrypted S3 evidence. GitHub Actions used OIDC roles for infrastructure, deployment and runtime controls.

Those assets remain in the repository so a future cloud migration can be evaluated without reconstructing the historical work.

## Re-activation rule

Do not execute the historical AWS workflows unless all of the following happen first:

1. the project owner explicitly approves AWS as a new/current target;
2. the deployment architecture is re-audited against the then-current application and payment architecture;
3. migration/rollback, budget, DNS, database and secret ownership are approved;
4. the current local-server data/game-content migration plan is documented;
5. protected GitHub environment configuration is reviewed from scratch;
6. the resulting staging environment is independently certified before any production consideration.

A future AWS decision must not reuse old assumptions blindly.

## Payment note

The old AWS documentation described direct hosted JazzCash fields. That is no longer the current Game Arena+ architecture.

Current Premium billing is:

`Browser → Game Arena API/BFF → external Payment Service → JazzCash → Payment Service webhook → Game Arena API/PostgreSQL → entitlement`

See `docs/PAYMENT-SERVICE-INTEGRATION.md`. If a future AWS deployment is approved, only the Game Arena server-side Payment Service configuration should be migrated for Premium; do not reintroduce browser/direct provider coupling.

## Current source of truth

Issue #48 is authoritative for the current local-server staging → UAT → production-approval path.

Production remains a separate explicit approval regardless of infrastructure provider.