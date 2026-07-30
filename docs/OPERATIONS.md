# Operations, SLOs and Incident Response

## Service objectives

Initial launch objectives, subject to owner approval:

| Service | SLI | Objective |
|---|---|---|
| Shell/catalogue/API | Successful non-user-error requests | 99.9% monthly |
| OTP request API | Accepted requests excluding client/rate-limit errors | 99.9% monthly |
| OTP delivery | Provider-accepted deliveries | 99% daily, tracked by channel/provider |
| Payment callbacks | Valid callbacks processed without duplicate side effects | 99.99% monthly |
| Entitlement activation | Paid transaction to active premium | 99% within 2 minutes; 99.9% within 15 minutes |
| Game starts | Player intent to frame load/Bridge ready | 95% within 5 seconds on supported devices/networks |
| Reward decisions | Valid completion to ledger decision | 99% within 3 seconds |

A 99.9% monthly objective permits about 43 minutes of unavailability. When 50% of the monthly error budget is consumed in seven days, freeze non-essential releases. At 100%, stop releases until the reliability owner approves recovery work.

## Required dashboards

- API request rate, p50/p95/p99 latency and errors by route/status
- OTP requests, verification success, provider acceptance/failure and circuit state
- Checkout creation, callbacks, paid/pending/failed/refunded status and activation latency
- Stale pending payments and reconciliation cases
- Game impressions, play intents, starts, Bridge-ready timing, exits and errors
- Reward verified/review/rejected decisions, daily-cap hits and manual adjustments
- Active sessions, sign-in anomalies and administrative failures
- Web Vitals and frontend errors for opted-in players only

## Alert ownership and severity

| Severity | Trigger examples | Response |
|---|---|---|
| SEV-1 | Unauthorized entitlement/ledger mutation, payment integrity failure, confirmed data exposure, platform unavailable >15 minutes | Page engineering/security/finance owner; freeze changes; owner update within 30 minutes |
| SEV-2 | OTP or payment provider unavailable, API error rate >5% for 10 minutes, game-origin outage, reward review spike | Engineering/operator response within 30 minutes; status update within 60 minutes |
| SEV-3 | One game failing, slow p95, elevated support contacts, non-critical reconciliation backlog | Triage in business hours; mitigate or schedule fix |

The final named owners, paging system, status page and communication channels are deployment prerequisites.

## Runbooks

### API or database outage

1. Confirm edge, API readiness and database connectivity separately.
2. Stop deployments and payment checkout if writes are uncertain.
3. Check database capacity, locks, storage and latest successful snapshot revision.
4. Roll back the API image only if migrations remain compatible.
5. Restore from point-in-time recovery only after preserving incident evidence.
6. Verify sessions, entitlements, transactions and coin balances before reopening writes.

### OTP delivery failure

1. Check request acceptance versus provider delivery metrics.
2. Confirm circuit-breaker status, sender approval, quota and provider incident status.
3. Fail over to the approved secondary provider.
4. Do not enable debug OTP outside an isolated test environment.
5. Announce sign-in degradation without revealing account existence.

### JazzCash degradation or mismatch

1. Disable new checkout creation if provider state cannot be trusted.
2. Continue accepting signed callbacks and status checks where safe.
3. Export provider transactions and run reconciliation.
4. Never activate premium from a screenshot or browser redirect alone.
5. Resolve amount/status mismatches with finance/provider evidence and audit every manual decision.

### Game failure or unsafe build

1. Pause catalogue entry or set rollout to zero.
2. Add the exact version path to the origin kill-switch map if immediate blocking is required.
3. Preserve build, manifest, scan report and player-error evidence.
4. Roll back active version and verify Bridge readiness and reward integrity.

### Reward or competition anomaly

1. Pause affected challenge/tournament claims if integrity is uncertain.
2. Review version, nonce, score, duration and duplicate/rate signals.
3. Keep suspicious results in review; do not rewrite the ledger silently.
4. Use reasoned adjustments and dual approval above the configured threshold.

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
- Next update time
- Owner and decision log

## Post-incident review template

1. Executive summary
2. Player and business impact
3. Detection and response timeline
4. Root cause and contributing conditions
5. What worked / failed
6. Security, privacy, payment and data-integrity assessment
7. Corrective actions with owners and deadlines
8. Monitoring/test changes
9. Communication follow-up

## Analytics policy

Optional analytics is off by default. Events are allow-listed and reject identity, OTP, session and payment fields. The production analytics destination, aggregation level and retention period require privacy approval; default retention should be the minimum needed for product and reliability decisions.
