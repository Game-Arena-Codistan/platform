# Game Arena AWS deployment

This is the primary staging and production deployment path for Game Arena. It provisions isolated AWS environments with OpenTofu and promotes immutable application releases through protected GitHub Actions environments.

The repository automation is complete, but execution still requires an authorized AWS account owner, approved hostnames, licensed game builds, OTP/JazzCash credentials, legal approval and manual launch qualification.

## Architecture

Each environment is isolated and contains:

- an encrypted VPC spanning at least two Availability Zones;
- public subnets for the AWS Application Load Balancer;
- private subnets and NAT egress for EKS nodes and PostgreSQL;
- an encrypted Amazon EKS cluster with managed nodes, control-plane logs and access entries;
- AWS Load Balancer Controller with a dedicated IRSA role;
- private encrypted Amazon RDS for PostgreSQL with an AWS-managed master password;
- ACM certificates validated through Route 53;
- immutable environment-specific ECR repositories for `api`, `web`, `admin` and `games`;
- Secrets Manager for application/provider configuration;
- SSM Parameter Store for non-secret deployment discovery;
- an encrypted, versioned S3 deployment-evidence bucket.

Staging and production must use different GitHub Environments, IAM roles, OpenTofu state keys, VPC CIDRs, EKS clusters, RDS instances, application secrets and ECR repository prefixes.

## One-time AWS and GitHub bootstrap

The first bootstrap cannot be performed by GitHub OIDC because the trust relationship does not exist yet. An AWS administrator must create:

1. the GitHub OIDC identity provider for `https://token.actions.githubusercontent.com` with audience `sts.amazonaws.com`;
2. a staging infrastructure role and production infrastructure role;
3. a staging deployment role and production deployment role;
4. an encrypted, versioned S3 state bucket with public access blocked;
5. a customer-managed KMS key for state encryption, when required by the organization.

Restrict each role trust policy to this repository and its matching GitHub Environment. The environment subject format is:

```text
repo:Game-Arena-Codistan/platform:environment:staging
repo:Game-Arena-Codistan/platform:environment:production
```

Use short-lived OIDC sessions only. Do not create AWS access keys for the workflows.

The infrastructure role needs the permissions required to manage the resources under `infra/opentofu/aws`. The deployment role needs, at minimum:

- `eks:DescribeCluster` and permission to obtain an EKS token;
- the EKS access entry created by OpenTofu;
- read access to the environment SSM prefix;
- read access to the RDS and application secrets;
- ECR image read/write and scan-result access for the four environment repositories;
- Route 53 record changes for the approved hosted zone;
- read access to ACM and ELB metadata;
- read/write access to the environment deployment-evidence bucket;
- KMS use for the environment secret, database and evidence keys;
- for the production role, read access to the staging SSM prefix and staging deployment-evidence marker used by promotion.

Scope IAM permissions to the account, Region, resource prefixes and repository environments wherever AWS supports it.

## Required GitHub Environments

Create protected GitHub Environments named `staging` and `production`.

Both environments require:

### Secrets

- `AWS_INFRA_ROLE_ARN`
- `AWS_DEPLOY_ROLE_ARN`
- `AWS_TFVARS_JSON_B64`

`AWS_TFVARS_JSON_B64` is the base64-encoded JSON form of the environment's OpenTofu variables. Start from the matching example under `infra/opentofu/aws`.

### Variables

- `AWS_REGION`
- `AWS_TF_STATE_BUCKET`
- `AWS_TF_STATE_KMS_KEY_ID` when a customer-managed state key is used
- `AWS_CONFIG_PREFIX`, normally `/game-arena/staging` or `/game-arena/production`
- `AWS_STAGING_CONFIG_PREFIX=/game-arena/staging` in production
- `OTP_PROVIDER_MODE`
- `JAZZCASH_MODE`
- `ALLOW_DEBUG_OTP`

Create the repository-level variable `AWS_STAGING_ENABLED=false` initially. Change it to `true` only after staging infrastructure, OIDC roles, Secrets Manager and DNS configuration are ready. This prevents expected release builds from triggering a deployment against an unconfigured AWS account.

Use these provider values:

| Environment | OTP | JazzCash | Debug OTP |
| --- | --- | --- | --- |
| Staging before provider onboarding | `mock` | `mock` | `true` |
| Staging provider qualification | `http` | `hosted` | `false` |
| Production | `http` | `hosted` | `false` |

Production must have required reviewers. Infrastructure apply, production promotion and production rollback should require approval from authorized operators.

## Infrastructure workflow

Workflow: **AWS infrastructure**

Pull requests automatically run formatting, initialization without a backend and provider-schema validation.

For an environment:

1. run `plan`;
2. review the retained text plan and cost/resource implications;
3. run `apply` from `main` with confirmation `APPLY`;
4. retain the non-sensitive outputs artifact;
5. populate the generated application secret before enabling real providers.

The S3 backend uses native lock files. Do not run two infrastructure operations against the same environment simultaneously.

## Application secret

OpenTofu creates an application secret with safe bootstrap values. Update it in Secrets Manager rather than GitHub. Preserve the following JSON keys:

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

Production deployment fails unless OTP mode is `http`, JazzCash mode is `hosted`, debug OTP is disabled, and the primary OTP plus JazzCash merchant values are populated.

JazzCash remains a fixed-duration single-charge implementation. Do not enable or advertise automatic renewal without written provider confirmation and an approved code/product change.

## Automated staging deployment

Workflow: **AWS staging deployment**

After **Build and publish images** succeeds on `main`, and repository variable `AWS_STAGING_ENABLED` is `true`, the staging workflow automatically:

1. selects the exact 40-character commit SHA;
2. assumes the staging AWS role through OIDC;
3. discovers infrastructure through SSM;
4. reads database and application secrets from Secrets Manager;
5. installs or upgrades the pinned AWS Load Balancer Controller;
6. copies the immutable images from GHCR into staging ECR;
7. renders Kubernetes manifests with staging configuration and ECR image references;
8. runs backwards-compatible database migrations;
9. deploys API, web, admin and controlled game origin;
10. waits for all rollouts;
11. upserts Route 53 aliases to the ALB;
12. verifies internal readiness, external TLS endpoints and security headers;
13. retains GitHub and encrypted S3 deployment evidence.

A manual staging dispatch is available for redeploying a selected commit already present on `main`.

## Production promotion

Workflow: **AWS production promotion**

Production does not deploy automatically from a branch push. The operator supplies:

- the full commit SHA;
- the staging qualification record;
- the approved change or go-live record;
- confirmation `PROMOTE`.

The workflow verifies that:

- the SHA is reachable from `main`;
- the same SHA has an AWS staging deployment marker;
- the provider modes and required production secrets are valid;
- immutable ECR images exist;
- no critical or high ECR scan findings are reported;
- the protected production Environment has approved the job.

It then runs migrations, deploys the exact qualified images, verifies health and records production evidence.

## Rollback

Workflow: **AWS rollback**

Supply a previously healthy full SHA, an incident/change record and confirmation `ROLLBACK`. The workflow verifies the historical deployment marker, skips database migrations and redeploys the earlier immutable application images.

Never perform a destructive database rollback during an application rollback. Database changes must remain backwards-compatible through the supported rollback window.

## DNS and certificates

OpenTofu requests one ACM certificate containing the player/API hostname and the controlled game-origin hostname, and validates it in Route 53. The deployment workflow waits for the ALB and upserts Route 53 alias records to the ALB canonical hosted zone.

The game origin must remain separate from the player origin so sandboxed games cannot inherit the player application's origin privileges.

## Evidence and qualification

Every deployment records:

- environment and commit SHA;
- actor, workflow run and attempt;
- player and game origins;
- ALB hostname;
- migration and rollback flags;
- non-sensitive qualification/change references;
- Kubernetes deployment, pod, service, ingress and event snapshots.

Repository automation does not replace manual launch evidence. Before public production traffic, complete issues #17, #26–#30, #40, #41 and #48, including:

- licensed game builds or written mirroring permission;
- real OTP and JazzCash qualification;
- legal and consumer-disclosure approval;
- physical-device, browser, network and accessibility testing;
- staging penetration and game-sandbox review;
- deployed peak-load testing;
- backup restore, application rollback and kill-switch rehearsal;
- named support, finance, security, incident and launch owners;
- controlled rollout and recorded go/no-go decisions.
