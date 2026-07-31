# Pre-staging deployment gate

The repository-controlled development work required before the first AWS staging deployment is complete when this document is present on `main` and `node scripts/check-pre-staging.mjs` passes.

## Release boundary

Deploy one full commit SHA from `main`. Do not merge the open Node, NGINX or GitHub Actions major-version Dependabot pull requests into the first staging baseline. Evaluate those changes after the baseline has been deployed and qualified.

## GitHub organization prerequisite

GitHub Actions must be able to allocate hosted runners. Restore the organization Actions allowance before attempting infrastructure validation, image publication or deployment.

## Protected `staging` environment

Configure these environment variables:

- `AWS_ACCOUNT_ID`: twelve-digit AWS account ID
- `AWS_REGION`: normally `ap-south-1`
- `AWS_CONFIG_PREFIX`: normally `/game-arena/staging`
- `AWS_TF_STATE_BUCKET`: encrypted OpenTofu state bucket
- `AWS_TF_STATE_KMS_KEY_ID`: optional customer-managed KMS key ID for state
- `AWS_STAGING_ENABLED`: keep `false` until infrastructure and runtime secrets exist; set `true` to enable automatic deployment and scheduled synthetics
- `OTP_PROVIDER_MODE`: `mock` for the initial staging deployment
- `JAZZCASH_MODE`: `mock` for the initial staging deployment
- `ALLOW_DEBUG_OTP`: `true` only for the isolated initial staging deployment

Configure these environment secrets:

- `AWS_INFRA_ROLE_ARN`: infrastructure plan/apply OIDC role
- `AWS_DEPLOY_ROLE_ARN`: deployment/bootstrap OIDC role
- `AWS_RUNTIME_ROLE_ARN`: namespace-scoped runtime-controls OIDC role
- `AWS_GAME_PUBLISH_ROLE_ARN`: immutable game artifact publication role
- `AWS_TFVARS_JSON_B64`: base64-encoded JSON equivalent of the reviewed staging tfvars

The decoded tfvars must contain the same `expected_aws_account_id` as `AWS_ACCOUNT_ID`, an explicit `kubernetes_version`, `operations_alert_email`, `monthly_budget_usd`, and a separate `github_runtime_role_arn`.

## Application secret contract

The initial application secret must contain the non-production OTP/JazzCash and product configuration consumed by `aws-deploy.yml`, including a non-empty mock webhook secret, top-up offers array and voucher-code object. Deployed environments do not use or require `ADMIN_API_KEYS`.

Administrator identity mappings, the administrator proxy secret, support delivery settings and legal holds live in the separate runtime-controls secret created by OpenTofu and are applied by `aws-runtime-controls.yml`.

## Controlled sequence

1. Run the repository CI matrix after Actions runner access is restored.
2. Publish images for the exact `main` SHA.
3. Run AWS infrastructure `validate`.
4. Run AWS infrastructure `plan` for `staging` and review account, region, DNS, IAM, EKS, RDS, budget and deletion behavior.
5. Run AWS infrastructure `apply` with the protected environment and `APPLY` confirmation.
6. Populate the application and runtime-controls secrets without placing secret values in GitHub issues or repository files.
7. Run the manual AWS staging deployment for the exact SHA.
8. Run runtime controls.
9. Run staging synthetic journeys and deployed Playwright tests.
10. Confirm the SNS email subscription, budget notifications, WAF, logs, alarms, migration evidence and rollback record.

## Fail-closed controls

- Critical third-party Actions are pinned to reviewed immutable commit SHAs.
- OpenTofu `1.12.5` and provider versions are exact.
- Every infrastructure run generates a Linux AMD64 dependency lock from the upstream registry, then initializes with `-lockfile=readonly`; the signed checksum lock is retained with the reviewed plan artifact.
- AWS authentication is constrained with `allowed-account-ids` and independently verified with STS.
- OpenTofu checks the authenticated account against `expected_aws_account_id`.
- Every deployed environment requires an explicit EKS version, operated alert destination, namespace-scoped runtime role and monthly cost budget.
- Production rejects public EKS API access from `0.0.0.0/0`.
- The repository gate rejects reintroduction of deployed shared administrator keys.
