# DigitalOcean infrastructure

This root OpenTofu module provisions the account resources required by the existing DOKS deployment workflow:

- a dedicated DigitalOcean Project
- an isolated VPC
- an autoscaling DOKS cluster
- a private managed PostgreSQL cluster and `game_arena` database
- a database firewall that trusts only the DOKS cluster

## State and credentials

The module intentionally declares a partial S3 backend. Store state in an encrypted, versioned remote backend such as a restricted DigitalOcean Spaces bucket. The GitHub workflow expects:

- `TF_BACKEND_CONFIG_B64`: base64-encoded backend HCL containing bucket, key, region and endpoint settings
- `TF_BACKEND_ACCESS_KEY` and `TF_BACKEND_SECRET_KEY`: Spaces credentials scoped to the state bucket
- `DIGITALOCEAN_ACCESS_TOKEN`: token with the minimum project, VPC, Kubernetes and database permissions
- `TFVARS_JSON_B64`: base64-encoded environment tfvars JSON

Never store these values in Git, workflow variables, issue comments or chat.

## Local validation

```bash
tofu fmt -check -recursive
tofu init -backend=false
tofu validate
```

## Deployment handoff

After apply, copy the sensitive `database_private_uri` output directly into the selected GitHub Environment as `DATABASE_URL`. Copy `doks_cluster_name` into the `DOKS_CLUSTER_NAME` variable. Then run `Deploy Kubernetes` for the same environment.

Use separate state keys and separate GitHub Environments for staging and production. Production applies require environment approval.
