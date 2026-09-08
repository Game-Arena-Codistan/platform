# Operations, SLOs and incident response

## Current deployment boundary

The active Game Arena staging/launch environment is the self-managed/local-server Docker Compose deployment. Operational runbooks must not assume AWS/EKS/S3 is present.

The public staging URL is `https://gsmarena-play.codistan.org`. Issue #48 remains the current launch-gate source of truth.

## Service objectives

Initial launch objectives remain subject to owner approval:

| Service | SLI | Objective |
|---|---|---|
| Shell/catalogue/API | Successful non-user-error requests | 99.9% monthly |
| OTP request API | Accepted requests excluding client/rate-limit errors | 99.9% monthly |
| OTP delivery | Provider-accepted deliveries | 99% daily, tracked by channel/provider |
| Payment webhooks/status reconciliation | Valid external Payment Service events processed without duplicate side effects | 99.99% monthly |
| Entitlement activation | Authoritative trial/paid status to active Premium | 99% within 2 minutes; 99.9% within 15 minutes |
| Game starts | Player intent to frame load/Bridge ready | 95% within 5 seconds on supported devices/networks |
| Reward decisions | Valid completion to ledger decision | 99% within 3 seconds |

A 99.9% monthly objective permits about 43 minutes of unavailability. When 50% of the monthly error budget is consumed in seven days, freeze non-essential releases. At 100%, stop releases until the reliability owner approves recovery work.

## Required operational visibility

- API request rate, p50/p95/p99 latency and errors by route/status;
- OTP request/verification/provider acceptance/failure;
- Payment Service BFF calls, wallet/subscription status, webhook success/failure/retry and entitlement latency;
- stale/pending payment or reconciliation cases;
- game impressions, play intents, starts, Bridge-ready timing, exits and errors;
- reward verified/review/rejected decisions and adjustments;
- active sessions, sign-in anomalies and administrative failures;
- frontend errors/Web Vitals only under the approved privacy policy.

## Alert ownership and severity

| Severity | Trigger examples | Response |
|---|---|---|
| SEV-1 | Unauthorized entitlement/ledger mutation, payment integrity failure, confirmed data exposure, platform unavailable >15 minutes | Page engineering/security/finance owner; freeze changes; owner update within 30 minutes |
| SEV-2 | OTP or Payment Service/provider unavailable, API error rate >5% for 10 minutes, game-origin outage, reward review spike | Engineering/operator response within 30 minutes; status update within 60 minutes |
| SEV-3 | One game failing, slow p95, elevated support contacts, non-critical reconciliation backlog | Triage in business hours; mitigate or schedule fix |

Final named owners, paging/notification path and communication channels are production-readiness requirements.

## Runbooks

### API or database outage

1. Confirm gateway, API readiness and PostgreSQL connectivity separately.
2. Stop deployments and new payment initiation if write integrity is uncertain.
3. Check container health, database capacity/locks/storage and the latest verified backup.
4. Roll back the application image only if migrations remain compatible.
5. Restore a database backup only after preserving incident evidence and using the approved recovery plan.
6. Verify sessions, entitlements, payment state and coin balances before reopening writes.

### OTP delivery failure

1. Check API acceptance versus provider delivery metrics.
2. Confirm circuit/provider state, sender approval and quota.
3. Fail over only to an approved secondary provider.
4. Do not enable debug OTP outside an isolated test environment.
5. Communicate degradation without revealing account existence.

### Payment Service / JazzCash degradation or mismatch

1. If authoritative provider state cannot be trusted, stop **new** Premium payment initiation using an approved operational change.
2. Continue safe signed webhook/status reconciliation where possible.
3. Determine whether the failure is Game Arena BFF, external Payment Service or underlying JazzCash/provider-side.
4. Never activate Premium from a screenshot, browser redirect or client claim.
5. Reconcile authoritative Payment Service/provider records with Game Arena entitlement/payment records.
6. Resolve amount/status/subscription mismatches only with provider/finance evidence and audit any manual decision.
7. Do not expose `PAYMENT_SERVICE_API_KEY`, webhook secret, wallet MPIN, provider token or raw secret-bearing payloads in incident logs/evidence.

Legacy direct JazzCash code may exist for unrelated non-subscription paths; do not switch the Game Arena+ subscription flow back to direct JazzCash as an incident workaround without a reviewed product/security change.

### Game failure or unsafe build

1. Pause the catalogue entry or set rollout to zero.
2. Apply the exact-version kill switch if immediate blocking is required.
3. Preserve build, manifest, scan report and player-error evidence.
4. Restore the previous verified immutable version and verify expected runtime behavior.

### Reward or competition anomaly

1. Pause affected challenge/tournament claims if integrity is uncertain.
2. Review version, nonce, score, duration and duplicate/rate signals.
3. Keep suspicious results in review; do not rewrite the ledger silently.
4. Use reasoned audited adjustments and required approval for high-value changes.

### Suspected data exposure

1. Restrict access and rotate affected credentials without deleting evidence.
2. Identify data type, accounts, time window, processors and logs.
3. Preserve an incident timeline and engage legal/privacy owners.
4. Follow approved notification obligations and communication wording.

## Communication template

- Incident ID and severity
- Start time and detection method
- Player impact and affected components
- What is known / not yet known
- Mitigation in progress
- Next update point
- Owner and decision log

## Post-incident review template

1. Executive summary
2. Player/business impact
3. Detection/response timeline
4. Root cause and contributing conditions
5. What worked / failed
6. Security/privacy/payment/data-integrity assessment
7. Corrective actions with owners
8. Monitoring/test changes
9. Communication follow-up

## Analytics policy

Optional analytics is off by default. Events must exclude identity, OTP, session and payment secrets/credentials. Production analytics destination, aggregation and retention require privacy approval.