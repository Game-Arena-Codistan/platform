# Staging application secret

The first AWS staging deployment uses mock OTP and mock JazzCash. The repository provides a local generator and validator for the exact application-secret keys consumed by `.github/workflows/aws-deploy.yml`.

## Generate securely

Run this only on an authorized operator workstation:

```bash
node scripts/generate-staging-application-secret.mjs \
  --output staging-application-secret.generated.json
```

The command:

- generates a cryptographically random JazzCash mock webhook secret;
- creates three non-production Arena Coin top-up offers;
- creates one random staging-only voucher;
- leaves all live OTP and JazzCash account fields empty;
- writes the file with owner-only permissions where supported;
- refuses to overwrite an existing file unless `--force` is supplied.

The generated filename is ignored by Git. Never paste its contents into issues, pull requests, chat, Vercel or repository files.

## Validate

```bash
node scripts/validate-staging-application-secret.mjs \
  staging-application-secret.generated.json
```

Validation fails if:

- a required deployment key is absent;
- a generated secret is too short;
- top-up or voucher JSON is malformed;
- live OTP or JazzCash provider values are present;
- database or legacy administrator credentials are included.

## Store after AWS exists

After OpenTofu has created the staging application secret and the AWS administrator has authenticated to the approved account, update the generated secret value using the ARN or name published under the staging configuration prefix.

Example operator sequence:

```bash
APP_SECRET_ARN="$(aws ssm get-parameter \
  --name /game-arena/staging/application-secret-arn \
  --query Parameter.Value \
  --output text)"

aws secretsmanager put-secret-value \
  --secret-id "$APP_SECRET_ARN" \
  --secret-string file://staging-application-secret.generated.json
```

Then delete the local generated file through the organization's secure-workstation process.

## Boundary

This file does not contain `DATABASE_URL`; the deployment workflow builds the PostgreSQL URL from the RDS endpoint and the AWS-managed database credential. Administrator mappings and operational controls belong in the separate runtime-controls secret.

Real OTP and JazzCash values are deliberately excluded. They are added only through separately reviewed provider-integration work.
