# Production readiness boundary

The codebase contains the player PWA, API, PostgreSQL migrations and durable adapter, private operations console, controlled game origin, content scanner/packager, deployment workflows, cloud infrastructure module and browser qualification suite.

A repository merge is not a production approval. Promotion requires all of the following evidence:

- DOKS, VPC and managed PostgreSQL provisioned from reviewed OpenTofu state
- DNS and TLS working for separate player and game origins
- deployment migrations, rollout and internal/external health checks passing
- licensed game archives imported to controlled hosting or explicit approved external-hosting exceptions
- OTP production sender/provider and failover verified
- JazzCash merchant checkout, signed callback/webhook, refund and reconciliation verified
- legal operator details, privacy/terms, processor list, age approach and game rights approved
- physical-device, low-bandwidth, orientation, accessibility and payment-return qualification recorded
- backup/PITR restore, application rollback, game kill switch and payment-disable rehearsal completed
- named engineering, security, finance, support, incident and launch owners

Staging may use mock OTP and mock JazzCash. Production must not use mock OTP, debug OTP codes or mock JazzCash. JazzCash access remains a fixed-duration single purchase unless written provider capability and approved customer wording establish another model.
