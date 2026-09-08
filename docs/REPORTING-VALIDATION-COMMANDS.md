# Reporting candidate validation commands

The authoritative validation target is the exact pull-request/main SHA being reviewed.

Run repository checks from an isolated checkout of that SHA:

```text
node scripts/security-check.mjs
node scripts/check-ai-native-readiness.mjs
node scripts/check-pre-staging.mjs
node scripts/check-api-contract.mjs
node scripts/check-cloud-deployment.mjs
```

`check-cloud-deployment.mjs` remains a repository-policy/static check; passing it does **not** mean AWS provisioning is required for the current launch.

Run the API suite, including payment-service, reporting and Admin security regressions:

```text
cd apps/api
npm ci --ignore-scripts --no-audit --no-fund
npm run ci
```

Run the applicable frontend/Admin/game checks through the normal PR workflows.

For deployed evidence, use the active sequence:

`exact reviewed SHA → immutable images → self-managed Docker Compose staging → automated staging certification → human UAT`

When real Game Arena+ payments are launch scope, also complete the provider-backed Payment Service UAT under #165/#166.

OpenTofu/AWS/Kubernetes checks may remain supplemental historical/static validation but are not deployment prerequisites for the current launch.

Record the exact SHA, run IDs, non-sensitive summaries and evidence references on the pull request and #48. Never record provider credentials, Payment Service secrets, MPINs or customer data.