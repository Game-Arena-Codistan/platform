# Deployment and recovery

## Selected target

AWS is the only active full-platform deployment target. Use separate AWS accounts or strongly isolated environments for staging and production. Do not reuse databases, buckets, OTP senders, JazzCash credentials, admin credentials, encryption keys or analytics destinations.

GitHub Environments hold protected variables, secrets and required reviewers. GitHub OIDC is used instead of stored AWS access keys.

## Components

- **Web:** immutable container/static files. Runtime `config.js` must remain no-store.
- **API:** one writer replica backed by private PostgreSQL for the current launch architecture.
- **Admin:** private operations console. It must not be exposed as a public service.
- **Game origin:** separate hostname and immutable distribution for scanned game versions.
- **PostgreSQL:** encrypted private RDS with backup and point-in-time recovery.
- **Edge:** AWS Load Balancer Controller and ALB route `/api` while preserving a separate game hostname.
- **Images:** immutable commit-addressed ECR images promoted from the release built from the same SHA.
- **Evidence:** encrypted S3 deployment records plus GitHub workflow summaries and artifacts.

## Active workflows

- `.github/workflows/vercel-preview.yml` — frontend-only pull-request previews in mock mode.
- `.github/workflows/release.yml` — publishes API, web, admin and game-origin images with provenance and SBOM metadata.
- `.github/workflows/aws-infrastructure.yml` — validates, plans and applies the AWS OpenTofu stack.
- `.github/workflows/aws-staging.yml` — deploys and verifies an immutable SHA in AWS staging.
- `.github/workflows/aws-staging-synthetic.yml` — scheduled production-like staging checks.
- `.github/workflows/aws-production.yml` — promotes an already-qualified staging SHA.
- `.github/workflows/aws-rollback.yml` — restores a previously healthy immutable SHA.

The complete bootstrap and variable/secret matrix is in `docs/AWS-DEPLOYMENT.md`.

## Local stack

```sh
cd infra
docker compose up --build
```

- Platform: `http://localhost:8080`
- Controlled game origin: `http://localhost:8082`
- Operations console: `http://localhost:8083`
- Demo OTP: available only because the local stack enables debug OTP
- JazzCash: mock mode only

## Staging sequence

1. Merge only after every required check passes.
2. Wait for **Build and publish images** on `main`.
3. Run **AWS infrastructure** in plan mode for staging and retain the reviewed plan.
4. Apply the approved staging plan through the protected environment.
5. Populate AWS Secrets Manager and SSM configuration without placing values in repository content or issue comments.
6. Run **AWS staging deployment** for a full 40-character commit SHA.
7. Verify migrations, rollouts, internal/external health, DNS/TLS, security headers and retained evidence.
8. Execute `docs/QUALIFICATION.md`, including physical devices, low-bandwidth behavior, accessibility, backup/restore and rollback.
9. Attach only non-sensitive evidence to issue #48.

Staging may use mock OTP and mock JazzCash for software validation. Real provider journeys must pass before production approval.

## Production sequence

1. Complete game-content, payment-provider, legal/operator, security and manual qualification gates.
2. Confirm that the exact SHA has a healthy AWS staging evidence marker.
3. Confirm production secrets, DNS/TLS, backup/PITR, monitoring and named owners.
4. Run **AWS production promotion** with `PROMOTE`, a qualification record and an approved change/go-live record.
5. The reusable deployment rejects production unless:
   - `OTP_PROVIDER_MODE=http`
   - `JAZZCASH_MODE=hosted`
   - `ALLOW_DEBUG_OTP=false`
6. Verify sign-in, catalogue, controlled game origin, payment smoke/reconciliation, entitlement activation, monitoring and rollback readiness.
7. Start the controlled rollout defined in `docs/GO-LIVE.md`.

Production must not use mock or disabled OTP/JazzCash modes. If a production provider is not ready, public launch remains blocked.

## Rollback

### Web, API or admin

1. Identify a SHA with a retained healthy deployment marker.
2. Run **AWS rollback** with the required confirmation and change/incident record.
3. The workflow verifies the marker, redeploys immutable images, waits for rollouts and records new evidence.
4. Do not reverse a database migration destructively. Migrations must remain compatible for at least one application rollback window.

### Game

- Pause the catalogue item, set rollout to zero or use the exact-version kill switch.
- Restore the previous verified active version.
- Preserve the failed build, manifest, scan report and incident evidence.

### Payments

- Stop new checkout creation only through an approved incident change.
- Continue safe signed callbacks/status/reconciliation where possible.
- Never grant premium from screenshots or browser-return state.

## Backup and disaster recovery

Initial objectives are RPO ≤15 minutes and RTO ≤2 hours, subject to approval and the provisioned AWS plan.

- Enable RDS point-in-time recovery and retained snapshots.
- Version and replicate approved game builds and manifests.
- Retain image digests, deployment evidence, migration versions and OpenTofu state history.
- Rehearse an isolated database restore, application rollback and game kill switch before public launch.
