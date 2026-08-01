# AWS staging account intake

## Current state

Repository automation is ready, but no AWS account has been supplied. Keep `AWS_STAGING_ENABLED=false`.

This intake contains only non-secret configuration. Do not place credentials, private keys, provider secrets, signed agreements or customer data in the repository or GitHub issues.

Template:

```text
infra/opentofu/aws/staging-account-intake.example.json
```

Copy the template to a secure local working file after the account exists. Do not commit the completed file.

## Decisions required from the owner

Provide or approve:

- twelve-digit AWS account ID;
- `ap-south-1` or another explicitly approved Region;
- Route 53 hosted zone and staging hostnames;
- operations alert email;
- monthly staging budget;
- GitHub Environment reviewers;
- account administrator who can create the state bucket, KMS key and OIDC roles.

OTP and JazzCash may remain `mock` for the first staging deployment.

## Bootstrap work for the AWS administrator

1. Create the GitHub Actions OIDC provider.
2. Create an encrypted, versioned and public-blocked OpenTofu state bucket.
3. Create or approve the state KMS key.
4. Create repository-and-environment-scoped roles for:
   - infrastructure plan/apply;
   - application deployment;
   - namespace-scoped runtime controls;
   - immutable game publication.
5. Create protected GitHub Environments named `staging` and `production`.
6. Populate the non-secret variables and role ARN secrets defined in `docs/PRE-STAGING-GATE.md`.
7. Review and encode the staging tfvars.
8. Keep `AWS_STAGING_ENABLED=false` until the infrastructure plan, application secret and runtime-controls secret are ready.

Role trust must be restricted to:

```text
repo:Game-Arena-Codistan/platform:environment:staging
```

No long-lived AWS access key is used by GitHub Actions or the Windows game uploader.

## First staging modes

```text
OTP_PROVIDER_MODE=mock
JAZZCASH_MODE=mock
ALLOW_DEBUG_OTP=true
AWS_STAGING_ENABLED=false
```

After infrastructure and secrets are populated, an authorized reviewer changes only `AWS_STAGING_ENABLED` to `true`.

## Go/no-go before enabling staging

All items must be true:

- GitHub Actions allowance can allocate runners.
- Account ID and Region are approved.
- DNS names are controlled.
- State bucket and locking are available.
- OIDC roles pass STS account verification.
- The OpenTofu plan has been reviewed.
- EKS version, budget and alert email are explicit.
- Application and runtime-control secrets exist.
- OTP and JazzCash modes are intentionally mock.
- No production or provider secret is present in Vercel.
- The exact deployment SHA is reachable from `main`.

## Work intentionally deferred

The following cannot be completed without external accounts or providers:

- AWS resource creation and billing acceptance;
- real DNS/certificate validation;
- OTP provider delivery;
- JazzCash merchant integration;
- staging penetration, load, restore and device evidence;
- production promotion.

The repository remains fail-closed until those inputs exist.
