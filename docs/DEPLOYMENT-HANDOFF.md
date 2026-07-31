# Deployment and integration handoff

**Prepared:** 2026-07-31  
**Target:** AWS staging, followed by qualified production promotion

## Repository-controlled work

The repository contains the controls required to provision staging, deploy an immutable release, integrate licensed game artifacts and external providers, qualify the environment and promote the same release to production.

Completed implementation includes:

- server-bound administrator identities and roles with a signed identity-proxy boundary;
- development-only local administrator keys and production provider guards;
- acknowledgement-safe, transactionally committed single-writer PostgreSQL persistence with restart and stale-writer tests;
- a least-privilege long-running database role bootstrapped after migrations;
- verified RDS TLS using the AWS trust bundle;
- JazzCash idempotency ownership, expected merchant/bill/amount/currency validation, authoritative notification handling and refund recomputation;
- exact play nonce and game-version proof, with uncertified competitions disabled by default;
- deployment-specific CSP, approved game hosts, immutable game URLs and release-scoped service-worker caches;
- pre-extraction ZIP type, path, collision, encryption, size and compression-ratio checks;
- immutable per-game S3/CloudFront publication outside platform Git history;
- WAF managed rules, per-IP rate protection, ALB TLS policy and access logging;
- EKS/RDS/container observability, alarms and encrypted alert delivery;
- separate bootstrap/deploy and namespace-scoped runtime roles;
- operated support delivery and account-retention/legal-hold processing;
- locked Node dependency trees and Dependabot;
- CodeQL security-extended analysis with retained SARIF evidence when GitHub Code Security upload is unavailable;
- Chromium, Firefox and WebKit automation plus a stateful deployed-staging synthetic journey.

## Required protected environment values

Create protected GitHub Environments named `staging` and `production` with required reviewers.

Each environment requires the existing AWS deployment and infrastructure values documented in `docs/AWS-DEPLOYMENT.md`, plus:

- `AWS_RUNTIME_ROLE_ARN`: namespace-scoped runtime-control role;
- `AWS_GAME_PUBLISH_ROLE_ARN`: role allowed to publish immutable game objects and read the game-artifact SSM parameters;
- `AWS_STAGING_ENABLED=true` for automatic staging deployment and scheduled journeys;
- fixed runner/egress CIDRs for the production EKS API;
- an operated alert address in production OpenTofu variables.

## Secrets Manager values to populate

### Application/provider secret

Populate the existing application secret with approved OTP and JazzCash values. Production deployment already rejects disabled/mock provider modes.

### Runtime-controls secret

OpenTofu creates the secret and initial random signing material. Before production promotion, populate:

```json
{
  "admin_proxy_secret": "generated-or-rotated-signing-material",
  "admin_identity_roles_json": "{\"admin@example.com\":[\"admin\",\"operator\"],\"finance@example.com\":[\"finance\"]}",
  "support_delivery_endpoint": "https://support-provider.example/events",
  "support_delivery_secret": "provider-signing-material",
  "legal_hold_user_ids": ""
}
```

The production provider guard requires a non-empty identity mapping and HTTPS support endpoint.

## Staging sequence

1. Approve the AWS account, Mumbai region unless changed, Route 53 zone and staging hostnames.
2. Bootstrap the protected GitHub OIDC roles and encrypted OpenTofu state.
3. Apply the reviewed staging OpenTofu plan.
4. Populate staging runtime/provider secrets; mock OTP and mock JazzCash are permitted.
5. Enable `AWS_STAGING_ENABLED` and deploy the selected immutable SHA.
6. The runtime-control workflow creates the restricted database role, patches the API credential, applies WAF/TLS/access logs and configures the game artifact origin.
7. Run the staging synthetic journey and browser matrix.
8. Publish a small representative licensed game set through `Import and publish game content`.
9. Complete provider, device, accessibility, security, load, restore and rollback qualification.

## Game handoff

Do not commit the downloaded game ZIP or expanded runtime trees directly to the platform repository.

For each title, record:

- source/build tool and reproducible build command;
- entry HTML file and required assets;
- external network/storage/permission requirements;
- orientation, device tier and input modes;
- rights reference and approved free/premium classification;
- Bridge compatibility and game-specific score/duration rules.

The protected import workflow preflights the archive, packages an immutable `slug/version`, uploads it to the environment artifact bucket and opens a metadata-only review PR.

## Production no-go conditions

Do not promote while any of these remains true:

- licensed launch games and rights evidence are incomplete;
- real OTP delivery/failover is unverified;
- JazzCash sandbox/live settlement, refund and reconciliation evidence is incomplete;
- production administrator identities, support delivery or named alert ownership are absent;
- critical/high security findings remain open;
- backup/PITR, rollback, payment disable and game kill-switch rehearsals have not passed;
- physical-device, accessibility and adverse-network evidence is incomplete;
- the exact staging-qualified SHA is not the production promotion target.

## External completion boundary

The remaining work requires external accounts, credentials, source archives, approvals or physical testing. It is tracked in:

- #17 — live JazzCash merchant integration and evidence;
- #40 — licensed game source handoff, publication and certification;
- #48 — actual AWS provisioning, environment qualification and controlled production rollout.
