# Cloud deployment

AWS is the selected full-platform target. The former generic DigitalOcean/AWS deployment workflow and DigitalOcean infrastructure path were retired because they duplicated the protected AWS delivery system and allowed weaker production-provider settings.

Use:

- `docs/AWS-DEPLOYMENT.md` for one-time AWS/OIDC/state bootstrap, environment configuration, infrastructure plan/apply and operations.
- `docs/DEPLOYMENT.md` for the staging, production, rollback and recovery sequence.
- `.github/workflows/vercel-preview.yml` for frontend-only mock previews.
- `.github/workflows/release.yml` for immutable image publication.
- `.github/workflows/aws-infrastructure.yml` for protected AWS OpenTofu validation, plan and apply.
- `.github/workflows/aws-staging.yml` for staging deployment.
- `.github/workflows/aws-production.yml` for evidence-gated production promotion.
- `.github/workflows/aws-rollback.yml` for an approved rollback to a previously healthy SHA.

Frontend previews do not prove PostgreSQL, OTP delivery, JazzCash, isolated controlled game hosting or production security controls. Those require the AWS staging environment and evidence tracked in issue #48.
