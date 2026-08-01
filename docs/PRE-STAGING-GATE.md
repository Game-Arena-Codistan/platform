# Pre-staging deployment gate

Repository-controlled infrastructure preparation is complete when this document is present on `main` and `node scripts/check-pre-staging.mjs` passes. Manual AWS backend deployment is additionally blocked until `node scripts/check-postgres-staging-readiness.mjs` passes.

## Release boundary

Deploy one full commit SHA from `main`. Do not merge unreviewed Node, NGINX or GitHub Actions major-version Dependabot pull requests into the first staging baseline. Evaluate those changes after the baseline has been deployed and qualified.

## Mandatory PostgreSQL boundary

The first manual AWS backend deployment must use normalized transactional PostgreSQL repositories as the runtime source of truth.

Before deployment:

```bash
node scripts/check-postgres-staging-readiness.mjs
```

The check fails while the backend contains any of these legacy patterns:

- the `platform_state` JSON document;
- whole-platform encode/restore persistence;
- a whole-state advisory lock;
- a single-writer API restriction.

Issue #52 must be completed with normalized tables/repositories, commit-before-acknowledgement behavior, database constraints, safe concurrent API writers, migration/reset instructions and PostgreSQL durability/concurrency tests. Do not waive this gate merely to obtain a successful staging deployment.

## GitHub organization prerequisite

GitHub Actions must be able to allocate hosted runners. Restore the organization Actions allowance before attempting infrastructure validation, image publication or deployment.

## Protected `staging` environment

Configure these environment variables:

- `AWS_ACCOUNT_ID`: twelve-digit AWS account ID
- `AWS_REGION`: normally `ap-south-1`
- `AWS_CONFIG_PREFIX`: normally `/game-arena/staging`
- `AWS_TF_STATE_BUCKET`: encrypted OpenTofu state bucket
- `AWS_TF_STATE_KMS_KEY_ID`: optional customer-managed KMS key ID for state
- `AWS_STAGING_ENABLED`: keep `false` until infrastructure and runtime secrets exist; set `true` only for an approved deployment
- `OTP_PROVIDER_MODE`: `mock` for the initial staging deployment
- `JAZZCASH_MODE`: `mock` for the initial staging deployment
- `ALLOW_DEBUG_OTP`: `true` only for the isolated initial staging deployment

Configure these environment secrets:

- `AWS_INFRA_ROLE_ARN`: infrastructure plan/apply OIDC role
- `AWS_DEPLOY_ROLE_ARN`: deployment/bootstrap OIDC role
- `AWS_RUNTIME_ROLE_ARN`: namespace-scoped runtime-controls OIDC role
- `AWS_GAME_PUBLISH_ROLE_ARN`: immutable game artifact publication role
- `AWS_TFVARS_JSON_B64`: base64-encoded JSON equivalent of the reviewed staging tfvars

The decoded tfvars must contain the same `expected_aws_account_id` as `AWS_ACCOUNT_ID`, an explicit `kubernetes_version`, `operations_alert_email`, `monthly_budget_usd` and a separate `github_runtime_role_arn`.

## Application secret contract

Generate the initial mock-provider secret locally:

```bash
node scripts/generate-staging-application-secret.mjs \
  --output staging-application-secret.generated.json
node scripts/validate-staging-application-secret.mjs \
  staging-application-secret.generated.json
```

Follow `docs/STAGING-APPLICATION-SECRET.md` to place the validated file into AWS Secrets Manager after the account and infrastructure exist. Never commit the generated file.

The secret contains the non-production OTP/JazzCash and product configuration consumed by `aws-deploy.yml`, including a generated mock webhook secret, top-up offers and a staging voucher. It deliberately excludes database credentials, live provider credentials and `ADMIN_API_KEYS`.

Administrator identity mappings, the administrator proxy secret, support delivery settings and legal holds live in the separate runtime-controls secret created by OpenTofu and applied by `aws-runtime-controls.yml`.

## Game portfolio boundary

Use `docs/GAME-PORTFOLIO-STATUS.md` for the authoritative count definitions:

- 61 submitted catalogue rows;
- 44 QA-passed external catalogue entries;
- Arena Dash plus those entries gives 45 current preview cards;
- four oversized titles are the initial controlled-origin publication pilots, not the total catalogue.

## Controlled sequence

1. Complete issue #52 and pass the PostgreSQL readiness check.
2. Restore GitHub Actions runner access and run the complete repository CI matrix.
3. Generate and validate the staging application secret locally.
4. Publish images for the exact reviewed `main` SHA.
5. Run AWS infrastructure `validate`.
6. Run AWS infrastructure `plan` for `staging` and review account, Region, DNS, IAM, EKS, RDS, budget and deletion behavior.
7. Run AWS infrastructure `apply` with the protected environment and `APPLY` confirmation.
8. Store the validated application secret and populate the separate runtime-controls secret without exposing values in GitHub or Vercel.
9. Run the manual AWS staging backend deployment for the exact SHA.
10. Run runtime controls and connect the staging frontend in live mode.
11. Run staging synthetic journeys and deployed Playwright tests.
12. Publish and qualify the four oversized pilots one at a time while rollout remains `0` until approved.
13. Confirm SNS subscription, budget notifications, WAF, logs, alarms, PostgreSQL migration evidence and rollback records.

## Fail-closed controls

- Critical third-party Actions are pinned to reviewed immutable commit SHAs.
- OpenTofu `1.12.5` and provider versions are exact.
- Infrastructure runs generate Linux AMD64 provider-lock evidence and initialize with `-lockfile=readonly`.
- AWS authentication is constrained with `allowed-account-ids` and independently verified with STS.
- OpenTofu verifies the authenticated account against `expected_aws_account_id`.
- Every deployed environment requires an explicit EKS version, operated alert destination, namespace-scoped runtime role and monthly budget.
- Production rejects public EKS API access from `0.0.0.0/0`.
- The repository gate rejects reintroduction of deployed shared administrator keys.
- The PostgreSQL gate rejects the legacy JSON state blob and single-writer runtime.
