# Cloud deployment

Game Arena uses three separate delivery paths:

1. **Vercel preview** for the frontend-only PWA in mock mode.
2. **DigitalOcean Kubernetes (DOKS)** for the full platform.
3. **AWS EKS** for the full platform.

The Kubernetes application manifests are shared. Only cloud authentication, TLS and edge routing differ.

## Frontend preview on Vercel

The workflow `.github/workflows/vercel-preview.yml` validates and deploys `apps/web` for pull requests that change the frontend.

Create a Vercel project with root directory `apps/web`, then add these GitHub repository secrets:

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

The workflow uses the prebuilt Vercel CLI flow. If the secrets are absent, frontend validation still runs and the preview deployment is skipped.

Vercel previews intentionally use `apps/web/config.js` in mock mode. They are suitable for design, navigation, responsive and accessibility review. They do not prove OTP delivery, JazzCash, PostgreSQL, entitlements, rewards or game-origin isolation.

## Shared Kubernetes prerequisites

Before running `.github/workflows/deploy-kubernetes.yml`:

- A Kubernetes cluster exists.
- A managed PostgreSQL database exists and is reachable privately from the cluster.
- The four GHCR images have been published by `.github/workflows/release.yml`.
- DNS names are selected for the player platform and separate game origin.
- A `staging` or `production` GitHub Environment is configured with reviewers where appropriate.

The current API must remain at one writer replica. Do not horizontally scale API writes until durable state is fully normalized.

## GitHub Environment configuration

Configure the following separately in the `staging` and `production` GitHub Environments.

### Required shared variables

- `PUBLIC_HOST` — player hostname, for example `staging.gamearena.pk`
- `GAME_HOST` — isolated game hostname, for example `games-staging.gamearena.pk`
- `DATABASE_SSL` — normally `true`
- `GHCR_USERNAME` — GitHub user or machine account allowed to read the private images
- `OTP_PROVIDER_MODE` — `mock`, `http` or `disabled`
- `ALLOW_DEBUG_OTP` — `true` only for controlled staging
- `JAZZCASH_MODE` — `mock`, `hosted` or `disabled`
- `OTP_PRIMARY_NAME`, `OTP_SECONDARY_NAME` — optional provider labels
- `JAZZCASH_ACTION_URL` — required when hosted checkout is enabled
- `JAZZCASH_RETURN_URL` — optional; defaults to the public `/api/v1/payments/jazzcash/return` endpoint
- `PUBLIC_HEALTH_URL`, `GAME_HEALTH_URL` — optional external health checks after DNS is live

### Required shared secrets

- `DATABASE_URL`
- `GHCR_READ_TOKEN` — read-only package token for the cluster image-pull secret
- `ADMIN_API_KEYS` — long random value; the admin service remains private
- `JAZZCASH_WEBHOOK_SECRET` — required even while checkout is mocked

### Provider credentials when enabled

- `OTP_PRIMARY_ENDPOINT`, `OTP_PRIMARY_API_KEY`
- `OTP_SECONDARY_ENDPOINT`, `OTP_SECONDARY_API_KEY`
- `JAZZCASH_MERCHANT_ID`
- `JAZZCASH_PASSWORD`
- `JAZZCASH_INTEGRITY_SALT`

Do not put any secret value in the repository, issue comments, workflow variables or chat.

## DigitalOcean Kubernetes

### Cluster requirements

- A DOKS cluster exposing Gateway API through the `cilium` GatewayClass.
- A managed PostgreSQL database or other approved private PostgreSQL service.
- TLS certificate and private key covering both configured hostnames, or a pre-created Kubernetes TLS secret.

### GitHub Environment additions

Variable:

- `DOKS_CLUSTER_NAME`
- `TLS_SECRET_NAME` — optional, defaults to `game-arena-tls`

Secrets:

- `DIGITALOCEAN_ACCESS_TOKEN`
- `TLS_CERT_B64`
- `TLS_KEY_B64`

The TLS values are base64 encodings of the PEM certificate chain and private key. They may be omitted when the named TLS secret already exists in the `game-arena` namespace.

The workflow authenticates with `doctl`, writes a short-lived kubeconfig, verifies the managed GatewayClass, runs migrations, deploys the application and creates the DigitalOcean Gateway/HTTPRoutes.

## AWS EKS

### Cluster requirements

- An EKS cluster.
- AWS Load Balancer Controller installed and an `alb` IngressClass available.
- An ACM certificate covering both configured hostnames.
- A managed PostgreSQL service, normally Amazon RDS for PostgreSQL, reachable from the cluster.
- A GitHub OIDC IAM role restricted to this repository, workflow and intended GitHub Environment.

### GitHub Environment additions

Variables:

- `AWS_REGION`
- `EKS_CLUSTER_NAME`
- `AWS_CERTIFICATE_ARN`

Secret:

- `AWS_DEPLOY_ROLE_ARN`

The workflow exchanges GitHub's OIDC token for short-lived AWS credentials, updates kubeconfig, verifies the ALB IngressClass, runs migrations, deploys the application and applies the ALB edge configuration.

## Deploy

1. Merge the release candidate to `main` and wait for **Build and publish images** to succeed.
2. Open **Actions → Deploy Kubernetes → Run workflow**.
3. Select `digitalocean` or `aws`.
4. Select `staging` or `production`.
5. Leave `image_tag` empty to deploy the selected `main` commit, or enter a previously published commit SHA for rollback/redeployment.
6. Approve the selected GitHub Environment when required.

The workflow verifies image availability, creates Kubernetes secrets without printing values, renders provider-specific manifests, runs the migration job, waits for all rollouts and performs internal health checks. External checks run when health URLs are configured.

## DNS and first deployment

The workflow summary reports the provisioned load-balancer address. Create DNS records for `PUBLIC_HOST` and `GAME_HOST` pointing to that address. Re-run the deployment after DNS/TLS is ready so external health checks can complete.

Do not expose the `admin` service publicly. Use an authenticated private network, VPN/bastion or a temporary local port-forward:

```bash
kubectl -n game-arena port-forward service/admin 8083:8080
```

Then open `http://127.0.0.1:8083` and use an approved administrator key.

## Provider modes

Staging defaults to mock OTP and mock JazzCash unless overridden. Production rejects mock OTP, debug OTP and mock JazzCash. Production may launch with a provider disabled, but the unavailable journey must be visibly disabled in the product and approved in the launch decision.

Automatic renewal is not implemented or promised. Monthly and yearly access remain fixed-duration purchases until JazzCash capabilities, merchant terms and customer disclosures are approved in writing.

## Rollback

Run the same deployment workflow with the last healthy published commit SHA in `image_tag`. Database migrations must remain backwards compatible; never perform a destructive database rollback as part of an application rollback.

Game incidents should use catalogue pause/rollout controls or the game-origin kill switch before rolling back the whole platform.
