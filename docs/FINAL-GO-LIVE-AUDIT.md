# Final staging and go-live audit

**Audit date:** 2026-07-31  
**Repository:** `Game-Arena-Codistan/platform`  
**Base:** `4d4e65ef13ee03609630f905b12077d85dcfec84`

## Executive conclusion

The repository can be used to provision an initial AWS staging environment, deploy the current demo release and exercise infrastructure automation. It is **not yet a production-ready release candidate** where only game files and JazzCash credentials are missing.

The audit found a small number of high-impact implementation gaps. They are real launch blockers and must be closed without adding unrelated product features.

Staging infrastructure work may proceed in parallel, but the environment must not be treated as production qualification evidence until the P0 items below are merged and redeployed.

## Readiness by area

| Area | Status | Required action |
|---|---|---|
| AWS infrastructure definition and protected delivery | Ready for initial staging provisioning | Provision, observe cost, tighten production access and add operational telemetry |
| Player PWA and mobile-first navigation | Functionally ready | Fix runtime CSP/config caching and add WebKit/Firefox automation |
| OTP/session boundary | Mock-ready | Select and integrate real providers; verify sender, failover and throttling |
| Administrative operations | Blocked | Bind roles to credentials/identity and require production SSO/MFA |
| PostgreSQL durability | Blocked for production | Replace asynchronous whole-state snapshot with transactional normalized persistence |
| JazzCash software boundary | Blocked for merchant testing | Fix idempotency ownership, authoritative callback validation, return handling and entitlement refunds |
| Rewards and competitions | Conditional | Require play proof fields; keep valuable competitions disabled until game-specific integrity rules exist |
| Game ingestion | Conditional | Preflight ZIP metadata before extraction and separate source/artifacts from the platform repository |
| Controlled game delivery | Demo-ready only | Move bulk immutable games to object storage/CDN rather than one growing Git/container artifact |
| Monitoring and incident response | Blocked for production | Add application logs, metrics, alarms, WAF/rate controls and paging destinations |
| Privacy, deletion and support | Draft-ready | Implement deletion completion and deliver support tickets to an operated system |
| Legal/operator details and manual qualification | External gate | Complete in AWS staging before production promotion |

## P0 implementation blockers

### 1. Administrative identity and authorization

Current API authorization checks a shared key list, then accepts `x-admin-role` from the request. A valid key holder can claim any role. The browser console also uses local keys rather than a production identity provider.

Required:

- replace `ADMIN_API_KEYS` with credentials bound to an immutable identity and allowed roles;
- derive authorization from the authenticated principal, never a client-selected role header;
- preserve distinct actors so dual approval cannot be completed by the same identity;
- keep local-key mode for isolated development only;
- require an identity-aware private access path with MFA/SSO for production administration.

Evidence: `apps/api/src/app.mjs`, `apps/api/src/admin-app.mjs`, `apps/api/src/config.mjs`, `apps/admin/app.js`, `infra/kubernetes/admin.yaml`.

### 2. Transactional PostgreSQL durability

The runtime extends the in-memory store and asynchronously writes one JSON snapshot to `platform_state`. Responses can be acknowledged before persistence. A mutation during an active flush can remain dirty without a subsequent scheduled flush. Several reads also mutate session, rate-limit or entitlement state without entering the persistence mutation list.

Normalized tables already exist but are not used by runtime operations.

Required:

- implement transactional repositories for users, identities, OTP challenges, sessions, payments, payment events, entitlements, ledger entries, play sessions, scores, audit records and operational queues;
- make payment, entitlement and coin operations atomic and idempotent in PostgreSQL;
- acknowledge successful mutations only after commit;
- use database constraints for ownership, uniqueness and ledger idempotency;
- add real PostgreSQL CI covering migrations, restart durability, concurrency and rollback compatibility;
- use an application-specific least-privilege database role rather than the RDS master user;
- validate the RDS certificate with the AWS CA bundle and `verify-full` semantics.

Evidence: `apps/api/src/adapters/postgres-store.mjs`, `apps/api/src/adapters/memory-store.mjs`, `apps/api/migrations/`, `apps/api/scripts/migrate.mjs`, `.github/workflows/qualification.yml`.

### 3. JazzCash correctness before live integration

The provider adapter and state machine are a useful baseline, but live activation needs stronger invariants.

Required:

- scope every checkout idempotency key to user, purchase kind and product, and reject ownership mismatch;
- verify merchant ID, bill reference, amount and currency against the stored transaction before a paid transition;
- use exact JazzCash field ordering/encoding test vectors supplied by the merchant portal;
- separate the browser-facing return route from the authoritative server-notification or reconciliation path;
- never activate premium solely from browser-delivered state;
- recompute entitlement state when one of several stacked purchases is refunded;
- implement or explicitly operationalize provider refund/void and settlement APIs;
- test duplicates, delayed events, out-of-order final states, amount mismatch and signature rejection.

Evidence: `apps/api/src/adapters/jazzcash.mjs`, `apps/api/src/services/payments.mjs`, `apps/api/src/app.mjs`, `apps/api/test/api.test.mjs`.

### 4. Production web security and cache correctness

The production CSP still hard-codes `games.codistan.org`; it does not authorize the configured AWS controlled-game hostname. The service worker can cache generated `config.js`, preserving old origins or mock/live mode. The browser always trusts the legacy host and the fallback game path omits immutable version information.

Required:

- generate CSP from the approved player, game and JazzCash origins;
- remove unconditional trust for `games.codistan.org` in live mode;
- make `config.js` network-only and never store it in the service-worker cache;
- key shell caches to the release SHA and use content-hashed asset filenames;
- require immutable versioned game URLs from catalogue data;
- add tests proving the controlled origin loads under the deployed CSP.

Evidence: `apps/web/deploy/nginx.conf`, `apps/web/deploy/40-game-arena-config.sh`, `apps/web/_headers`, `apps/web/sw.js`, `apps/web/src/api.js`.

### 5. Game result proof and feature gating

The completion route accepts a missing nonce and an optional game version. Scores remain client supplied, so valuable competition results require game-specific integrity controls.

Required:

- require exact nonce and game version for every completion;
- make one terminal result transition per play session atomic;
- apply game-specific duration, score and completion-frequency rules from approved manifests;
- keep cash-equivalent or valuable competitions disabled unless their integrity model is approved;
- hide or label multiplayer as lobby/coordination only unless the selected game has an actual realtime transport.

Evidence: `apps/api/src/app.mjs`, `apps/api/src/services/reward-policy.mjs`, `apps/api/src/adapters/memory-store.mjs`, `apps/api/src/mvp-app.mjs`.

### 6. Safe and scalable game supply chain

The ZIP pipeline validates paths before extraction but checks symlinks and total expanded bytes after extraction. Packaged game files are committed into the platform repository and bundled into one game-origin image.

Required before bulk import:

- inspect ZIP file type, symlink mode and cumulative uncompressed size before extraction;
- extract inside a restricted temporary environment with strict CPU, disk and time limits;
- classify every game by source/build tool, entry point, external network dependency, storage need, orientation, permissions and backend requirements;
- keep source in a dedicated private game-source repository or controlled per-game repositories;
- store built immutable artifacts outside Git history;
- publish versioned runtime artifacts to encrypted S3 and serve through CloudFront or an equivalent controlled CDN;
- keep only catalogue metadata, manifests, rights references and artifact digests in the platform repository;
- preserve per-version rollback and an immediate origin-level kill switch.

Evidence: `apps/game-ops/src/ingest.mjs`, `apps/game-ops/src/scanner.mjs`, `apps/game-ops/src/package-build.mjs`, `.github/workflows/game-content-import.yml`, `apps/game-origin/`, `infra/opentofu/aws/`.

## P1 production hardening

These items follow the P0 code fixes and must be complete before production promotion:

1. Add CloudWatch application/container logs, retained audit exports, service dashboards, alarms and paging destinations.
2. Add AWS WAF managed rules and rate-based protections to the public ALB/CloudFront path.
3. Set an explicit supported ALB TLS policy and enable access logs.
4. Restrict the EKS API endpoint to controlled runner/egress CIDRs or use a private runner path.
5. Split infrastructure/bootstrap privileges from namespace-scoped application deployment privileges.
6. Replace broad cluster egress with workload-specific NetworkPolicies.
7. Add WebKit and Firefox Playwright projects; retain physical iPhone/Android accessibility testing as manual evidence.
8. Add dependency update automation, CodeQL or equivalent SAST, committed lockfiles, `npm ci`, pinned container digests and pinned GitHub Action commits for the production release.
9. Implement account-deletion completion and retention/legal-hold processing.
10. Route support tickets to a staffed support system and verify escalation ownership.
11. Disable seeded challenges/tournaments and uncertified external games by default in live environments.
12. Run deployed write-heavy RDS load tests, PITR restore, application rollback, payment-disable and game-kill-switch rehearsals.

## Staging plan

### Phase A — provision infrastructure now

- approve AWS account, Region, Route 53 zone and staging hostnames;
- create protected `staging` and `production` GitHub Environments;
- bootstrap GitHub OIDC roles and encrypted OpenTofu state;
- run and review the staging plan;
- provision staging EKS/RDS/ECR/ACM/Route 53/Secrets Manager/SSM;
- deploy the current demo release with mock OTP and mock JazzCash;
- record cost, deployment timing, DNS/TLS behavior and rollback mechanics.

This deployment is an infrastructure shakeout, not final qualification.

### Phase B — merge P0 remediation

Recommended implementation order:

1. web CSP/runtime cache and controlled-origin fixes;
2. administrator identity/role binding;
3. payment correctness and play-proof enforcement;
4. ZIP preflight and game artifact architecture;
5. transactional PostgreSQL repositories and Postgres CI;
6. RDS CA verification and least-privilege DB user.

### Phase C — qualify corrected staging

- redeploy one immutable SHA containing all P0 fixes;
- run full-stack Postgres journeys and restart tests;
- run Chromium, WebKit and Firefox automation;
- run mock-provider and then approved real-provider tests;
- import a small representative game set through the final pipeline;
- complete security, accessibility, network, backup and rollback evidence.

## Production no-go rules

Do not promote to production while any of the following is true:

- administrative roles are client-selectable or production admin lacks MFA/SSO;
- payment activation can occur without expected amount/currency/merchant validation;
- an acknowledged entitlement, ledger or payment write can be lost on API failure;
- the controlled game origin is blocked by CSP or legacy external hosts remain implicitly trusted;
- runtime configuration can be served from a stale service-worker cache;
- game ZIPs are extracted before symlink and expanded-size preflight;
- the launch catalogue contains uncertified or unlicensed external games;
- application logs, alerts, support ownership, legal contacts or incident paging are absent;
- real OTP, JazzCash, backup/restore, rollback and physical-device evidence is incomplete;
- any critical/high security or payment-integrity finding remains open.

## Scope discipline

This plan intentionally excludes redesign work that does not close a launch risk. New social systems, chat, recommendation ML, new currencies, cosmetic admin features and generalized microservice decomposition are not required for staging or launch.
