# Production readiness boundary

The repository contains the player PWA, API, PostgreSQL migrations and durable adapter, private operations console, controlled game origin, content scanner/packager, Game Bridge SDK, automated qualification, protected AWS infrastructure/delivery workflows and operating runbooks.

Repository implementation is complete for the launch-candidate scope. A merge or successful workflow is not a claim that external infrastructure, licensed content or a merchant account is live.

Only three execution gates remain:

## 1. Game content deployment and rights — issue #40

- Supply original licensed game archives or approved written mirroring permission.
- Record rights for each game and artwork asset.
- Import, scan, package and publish immutable versions to the controlled game origin.
- Certify launch versions on supported devices and exercise pause, rollback and kill-switch controls.

## 2. AWS deployment and production qualification — issue #48

- Provision reviewed VPC, EKS, private RDS, ECR, ACM, Route 53, encrypted evidence storage and protected GitHub Environments.
- Install OTP configuration, operator/legal details, contacts, approved notices, monitoring and named owners.
- Deploy an immutable SHA to AWS staging and complete device, network, accessibility, security, load, backup/restore and rollback evidence.
- Promote the same qualified SHA through the protected production workflow and controlled rollout.

## 3. Live JazzCash integration — issue #17

- Install approved merchant credentials and exact hosted-checkout/callback fields.
- Verify signed paid, pending, failed, cancelled, refund and reconciliation journeys.
- Keep monthly/yearly access as fixed-duration single purchases unless written provider capability and approved disclosure establish another model.

Production requires PostgreSQL, `OTP_PROVIDER_MODE=http`, `JAZZCASH_MODE=hosted` and `ALLOW_DEBUG_OTP=false`. Browser returns never grant premium without a verified backend event.

See `docs/AWS-DEPLOYMENT.md`, `docs/DEPLOYMENT.md`, `docs/QUALIFICATION.md` and `docs/REPOSITORY-AUDIT.md`.
