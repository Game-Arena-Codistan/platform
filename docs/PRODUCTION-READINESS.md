# Production readiness boundary

The codebase contains the player PWA, API, PostgreSQL migrations and durable adapter, private operations console, controlled game origin, content scanner/packager, deployment workflows, AWS infrastructure module and browser qualification suite.

AWS is the selected production target. A repository merge or successful workflow validation is not a production approval. Promotion requires all of the following evidence:

- AWS VPC, EKS, private RDS PostgreSQL, ECR, ACM, Route 53 and protected GitHub Environments provisioned from reviewed OpenTofu state;
- separate player/API and controlled game-origin DNS names serving valid TLS;
- immutable commit-addressed images promoted through AWS staging before protected production promotion;
- deployment migrations, rollout checks, internal/external health checks and retained evidence passing;
- licensed game archives imported to controlled hosting or explicit approved external-hosting exceptions;
- OTP production sender/provider and failover verified;
- JazzCash merchant checkout, signed callback/webhook, refund and reconciliation verified;
- legal operator details, privacy/terms, processor list, age approach and game rights approved;
- physical-device, low-bandwidth, orientation, accessibility and payment-return qualification recorded;
- backup/PITR restore, application rollback, game kill switch and payment-disable rehearsal completed;
- named engineering, security, finance, support, incident and launch owners.

Staging may use mock OTP and mock JazzCash. Production must use `OTP_PROVIDER_MODE=http`, `JAZZCASH_MODE=hosted`, and `ALLOW_DEBUG_OTP=false`; it must not use mock or incomplete provider configuration. JazzCash remains a fixed-duration single purchase unless written provider capability and approved customer wording establish another model.

See `docs/AWS-DEPLOYMENT.md` and issue #48 for the AWS execution and evidence checklist.
