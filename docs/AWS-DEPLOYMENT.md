# Game Arena AWS deployment

AWS is the authoritative staging and production target. The repository defines isolated environments with OpenTofu and promotes immutable application releases through protected GitHub Actions.

The automation is complete. Execution still requires an authorized AWS account, approved hostnames, production configuration, licensed games, provider credentials and qualification evidence.

## Architecture

Each environment contains:

- an encrypted VPC across at least two Availability Zones;
- public subnets for the Application Load Balancer;
- private subnets and NAT egress for EKS nodes and PostgreSQL;
- encrypted Amazon EKS with managed nodes, access entries and control-plane logs;
- AWS Load Balancer Controller with a dedicated IRSA role;
- private encrypted RDS PostgreSQL with an AWS-managed master password;
- ACM certificates validated through Route 53;
- immutable environment-specific ECR repositories for `api`, `web`, `admin` and `games`;
- Secrets Manager for application/provider configuration;
- SSM Parameter Store for non-secret deployment discovery;
- an encrypted, versioned S3 deployment-evidence bucket.

Staging and production use separate GitHub Environments, IAM roles, state keys, VPCs, EKS clusters, RDS instances, application secrets and ECR prefixes.

## One-time bootstrap

An AWS administrator must create:

1. the GitHub OIDC identity provider for `https://token.actions.githubusercontent.com` with audience `sts.amazonaws.com`;
2. staging and production infrastructure roles;
3. staging and production deployment roles;
4. an encrypted, versioned S3 state bucket with public access blocked;
5. a customer-managed KMS key for state encryption when required.

Restrict each role to this repository and its matching GitHub Environment:

```text
repo:Game-Arena-Codistan/platform:environment:staging
repo:Game-Arena-Codistan/platform:environment:production
```

Use short-lived OIDC sessions only. Do not create AWS access keys for workflows.

The deployment role requires scoped access to EKS, the environment SSM prefix, RDS/application secrets, ECR, Route 53, ACM/ELB metadata, the deployment-evidence bucket and applicable KMS keys. Production also needs read access to the staging evidence marker used for promotion.

## Protected GitHub Environments

Create `staging` and `production` Environments.

### Secrets

- `AWS_INFRA_ROLE_ARN`
- `AWS_DEPLOY_ROLE_ARN`
- `AWS_TFVARS_JSON_B64`

`AWS_TFVARS_JSON_B64` is the base64-encoded JSON form of the matching example under `infra/opentofu/aws`.

### Variables

- `AWS_REGION`
- `AWS_TF_STATE_BUCKET`
- `AWS_TF_STATE_KMS_KEY_ID` when required
- `AWS_CONFIG_PREFIX`, normally `/game-arena/staging` or `/game-arena/production`
- `AWS_STAGING_CONFIG_PREFIX=/game-arena/staging` in production
- `OTP_PROVIDER_MODE`
- `JAZZCASH_MODE`
- `ALLOW_DEBUG_OTP`

Keep repository variable `AWS_STAGING_ENABLED=false` until staging infrastructure, OIDC roles, Secrets Manager and DNS are ready.

| Environment | OTP | JazzCash | Debug OTP |
|---|---|---|---|
| Early staging | `mock` | `mock` | `true` |
| Provider qualification | `http` | `hosted` | `false` |
| Production | `http` | `hosted` | `false` |

Production must have required reviewers. Infrastructure apply, production promotion and production rollback require authorized approval.

## Infrastructure workflow

Workflow: **AWS infrastructure**

Pull requests run formatting, backend-free initialization and provider-schema validation. For each environment:

1. run `plan`;
2. review and retain the text plan and cost/resource implications;
3. run `apply` from `main` with confirmation `APPLY`;
4. retain non-sensitive outputs;
5. populate the generated application secret before enabling providers.

The S3 backend uses native lock files. Do not run concurrent operations against one environment.

## Application secret

OpenTofu creates an application secret with safe bootstrap values. Update it in Secrets Manager, preserving these keys:

```json
{
  "admin_api_keys": "comma-separated-random-keys",
  "otp_primary_name": "primary",
  "otp_primary_endpoint": "",
  "otp_primary_api_key": "",
  "otp_secondary_name": "secondary",
  "otp_secondary_endpoint": "",
  "otp_secondary_api_key": "",
  "jazzcash_webhook_secret": "",
  "jazzcash_merchant_id": "",
  "jazzcash_password": "",
  "jazzcash_integrity_salt": "",
  "jazzcash_action_url": "",
  "topup_offers_json": "[]",
  "voucher_codes_json": "{}"
}
```

Production deployment fails unless OTP is `http`, JazzCash is `hosted`, debug OTP is disabled, and required primary OTP and JazzCash values are populated.

JazzCash remains a fixed-duration single-charge implementation. Do not advertise automatic renewal without written provider confirmation and an approved implementation/product change.

## AWS staging deployment

After **Build and publish images** succeeds on `main` and `AWS_STAGING_ENABLED=true`, **AWS staging deployment**:

1. selects the exact 40-character commit SHA;
2. assumes the staging role through OIDC;
3. discovers infrastructure through SSM;
4. reads database/application secrets from Secrets Manager;
5. installs or upgrades the pinned AWS Load Balancer Controller;
6. promotes immutable images from GHCR into staging ECR;
7. renders Kubernetes manifests with ECR references;
8. runs backwards-compatible migrations;
9. deploys API, web, admin and game origin;
10. waits for rollouts;
11. upserts Route 53 aliases;
12. verifies internal readiness, external TLS endpoints and security headers;
13. retains GitHub and encrypted S3 evidence.

A manual dispatch can redeploy a selected commit reachable from `main`.

## Production promotion

**AWS production promotion** requires:

- the full commit SHA;
- a staging qualification reference;
- an approved change/go-live reference;
- confirmation `PROMOTE`.

The workflow verifies that the SHA is reachable from `main`, the same SHA has a healthy staging marker, production modes/secrets are valid, immutable ECR images exist, no critical/high ECR findings are reported, and the protected production Environment approves the job.

It then runs compatible migrations, deploys the exact qualified images, verifies health and records production evidence.

## Rollback

**AWS rollback** requires a previously healthy SHA, an incident/change reference and confirmation `ROLLBACK`. It verifies the historical marker, skips migrations and redeploys the prior immutable images.

Never perform a destructive database rollback during application rollback.

## DNS, certificates and game isolation

OpenTofu requests one ACM certificate containing the player/API hostname and the controlled game-origin hostname and validates it through Route 53. Deployment waits for the ALB and upserts aliases to the ALB canonical hosted zone.

The game origin must remain separate so sandboxed games cannot inherit player-origin privileges.

## Evidence and launch gates

Every deployment records environment, commit SHA, actor, workflow run/attempt, public/game origins, ALB hostname, migration/rollback flags, non-sensitive qualification references and Kubernetes snapshots.

Only three open execution gates remain:

- **Issue #40:** licensed game builds/rights, controlled-origin publication and game certification.
- **Issue #48:** AWS provisioning, OTP/operator/legal configuration, staging/manual/security/load/backup evidence and protected production promotion.
- **Issue #17:** live JazzCash merchant fields, callback/refund/reconciliation integration and end-to-end verification.

Never place credentials, signed agreements or customer data in issues or repository files.
