# Go-live runbook

## Authority boundary

This runbook does not authorize production by itself.

Production execution begins only after:

- the exact staging SHA is identified and automated-certified;
- real Payment Service/JazzCash staging UAT passes if paid launch is in scope;
- full human/manual UAT passes;
- all critical/high launch defects are closed and retested;
- production domain/TLS, database/content backups and rollback target are verified;
- the project owner gives explicit production authorization.

The current launch target is the self-managed/local-server architecture. AWS/EKS/S3 provisioning is not a hard prerequisite.

## Hard prerequisites

- exact approved application SHA and image references;
- `READY FOR UAT` automated evidence plus human UAT approval for the same final SHA;
- approved launch game set and controlled-origin behavior;
- production OTP/provider configuration appropriate to launch scope;
- approved external Payment Service production configuration if paid launch is enabled;
- provider/finance ownership for settlement, reconciliation, refunds/disputes if real charging is enabled;
- private Admin access and role mapping;
- database backup/restore evidence;
- persistent game-content backup/recovery evidence;
- rollback owner and previous known-good production reference;
- no unresolved critical/high security, payment, entitlement, persistence or game-runtime defect.

## Payment production boundary

Current Premium architecture:

`Browser → Game Arena API/BFF → external Payment Service → JazzCash → Payment Service webhook → Game Arena API/PostgreSQL → entitlement`

The browser never receives provider secrets and a redirect never grants Premium.

Do not re-enable a direct JazzCash Premium checkout simply because legacy provider adapters/settings exist.

If real charging is part of launch, #17 remains the provider/finance evidence gate and #165/#166 must first contain real staging UAT evidence.

## Release stages

A practical rollout may use:

1. internal/staff verification;
2. closed beta;
3. payment beta when real charging is enabled;
4. limited public rollout;
5. controlled expansion to full traffic.

The owner may choose a simpler rollout, but every stage must retain a rollback path and stop criteria.

## Advancement checks

- player/API availability and latency acceptable;
- authentication/OTP behavior acceptable;
- paid-to-entitlement behavior correct if payments are enabled;
- no unexplained provider/entitlement mismatch;
- certified game start success acceptable;
- no reward/ledger inconsistency;
- support/security signals within approved limits;
- no critical/high defect opened during the stage.

## Stop/rollback triggers

Stop expansion for:

- unauthorized Premium/coin/reward/tournament state;
- payment webhook verification failure or unexplained reconciliation mismatch;
- account/session exposure;
- widespread API/player/game-origin outage;
- database durability/migration issue;
- major provider outage without approved fallback;
- malicious or unstable game behavior;
- critical/high security finding;
- owner/incident lead stop decision.

## Before production cutover

Record non-sensitive evidence for:

- final SHA and image identity;
- staging certification run/artifact;
- human UAT approval;
- payment UAT approval when applicable;
- production backup/restore point;
- previous production rollback target;
- production domain/TLS readiness;
- provider modes/readiness;
- named cutover and rollback owners.

Never put secret values into the record.

## During cutover

Follow `docs/PRODUCTION-CUTOVER.md`.

At minimum:

- deploy the exact staging-approved artifacts;
- run required migrations safely;
- verify health/readiness and private Admin access;
- perform non-destructive smoke before/after public traffic change;
- watch logs/health/provider state;
- retain the old production target during the observation period.

## Immediate smoke

Verify:

- public home/catalogue over HTTPS;
- API readiness;
- exact authorized SHA;
- controlled game origin and representative game asset;
- private Admin boundary;
- no unexpected critical/high errors;
- no unintended payment/reward/customer mutation from smoke.

## Final go/no-go record

Capture:

- exact release SHA;
- staging certification reference;
- manual UAT reference;
- payment UAT/provider evidence when applicable;
- launch game scope;
- known low/medium risks and owners;
- rollback target/owner;
- final decision and approver timestamp.

Use issue #48 as the current local-server staging → UAT → production-approval gate. Production remains untouched until explicit approval.