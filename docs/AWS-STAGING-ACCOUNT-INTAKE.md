# Historical AWS staging account intake

> **Not required for the current Game Arena launch.**

The active staging environment is the existing self-managed/local-server Docker Compose deployment. No AWS account intake, OIDC role, EKS/RDS/S3 provisioning or AWS billing approval is needed for the current staging/UAT path.

This document is retained only so historical AWS planning is not lost.

## Current action

Do not collect AWS account IDs, IAM role ARNs, Route 53 zones, state-bucket values or OpenTofu variables for the current launch.

Use instead:

- `docs/DEPLOYMENT.md`
- `docs/DEPLOYMENT-HANDOFF.md`
- `infra/docker-compose.staging.yml`
- issue #48

## If AWS is approved later

A future AWS migration must start with a new infrastructure decision and fresh intake. Do not assume the historical values, topology, budgets, DNS, credentials or role boundaries are still valid.

Any future intake must be handled privately and must never put cloud credentials or secret values into repository files, issues or chat.

Issue #141 source-vault work is deferred/non-blocking for the current local-server release.