# Go-Live Runbook

## Hard prerequisites

Do not begin public rollout until these are complete:

- Approved operator identity, support/privacy contacts, privacy notice, terms, reward rules and tournament rules
- Original licensed game builds or written mirroring permission; launch set individually certified
- Production domain, TLS, database, object storage/CDN, monitoring and backup restore test
- Approved OTP sender/provider with primary and secondary delivery
- JazzCash merchant credentials, callback verification, settlement/reconciliation test and written recurring-billing decision
- Named incident, finance, security, support and launch owners
- Physical-device/network/accessibility evidence in issue #41
- Zero unresolved critical/high security, payment, entitlement or ledger findings

## Release stages

1. **Internal:** staff accounts only; production-like infrastructure and sandbox providers.
2. **Closed beta:** invited players, 10–20 certified games, no public acquisition.
3. **Payment beta:** capped group with real JazzCash, finance reconciliation every day.
4. **Public 5%:** limited acquisition; no new features during observation.
5. **25% / 50% / 100%:** advance only after the previous stage meets the thresholds below for at least one business day.

## Advancement thresholds

- API availability and latency within SLO
- OTP delivery acceptance ≥99%; verification failures consistent with invalid-code behavior
- Payment paid-to-entitlement activation ≥99% within 2 minutes and no unexplained amount/status mismatch
- Game start success ≥95% for certified titles; no critical device-specific regression
- Reward review/rejection rate within the approved baseline and no ledger inconsistency
- Support contact rate and refund requests within owner-approved limits
- Error budget burn below the release freeze threshold

## Stop / rollback triggers

Stop expansion and consider rollback when any of these occur:

- Unauthorized premium, coin or tournament outcome
- Payment callback verification failure or unexplained settlement mismatch
- Confirmed account/session exposure
- API error rate >5% for 10 minutes or core journey unavailable >15 minutes
- OTP delivery outage without working failover
- A game causes widespread crash, malicious behavior or reward inflation
- A critical/high security finding

## Launch-day checklist

### Before opening

- Pin commit/image digests and record migration versions
- Confirm backup/PITR marker and rollback commands
- Confirm status page and owner communication channel
- Validate health/readiness, catalogue count, game-origin headers and kill switch
- Complete one OTP journey per channel/provider
- Complete JazzCash paid, failed, cancelled and pending journeys
- Verify reconciliation and premium expiry dates
- Verify admin access through MFA/SSO and audit events
- Confirm Optional analytics remains off by default

### During rollout

- Monitor SLO, OTP, payments, game starts, rewards, support and security dashboards
- Reconcile provider transactions at least daily during payment beta
- Record every launch decision and stage change
- Pause only the affected game/feature where possible

### After each stage

- Review metrics and error budget
- Review payment/reward exceptions and support themes
- Confirm no open critical/high issue
- Record go/no-go approval from engineering, finance, operations and owner

## Final go/no-go record

- Release SHA and image digests
- Environment and domains
- Launch game list and versions
- Automated CI links
- Manual qualification evidence
- Legal/provider approvals
- SLO dashboard snapshot
- Known low/medium risks with owners
- Rollback owner and trigger
- Final decision, approvers and timestamp
