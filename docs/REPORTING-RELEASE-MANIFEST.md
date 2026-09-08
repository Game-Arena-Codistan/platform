# Game Arena+ reporting release manifest

## Status

This file originally described an earlier fixed-duration/direct-JazzCash reporting candidate. That candidate has since been merged, evolved and superseded by the current deployed application/payment architecture.

Do not use the historical branch/base/SHA or AWS staging instructions as current deployment guidance.

## Current reporting boundary

Current Game Arena+ subscription architecture:

`Browser → Game Arena API/BFF → external Payment Service → JazzCash → Payment Service webhook → Game Arena API/PostgreSQL → entitlement`

Reporting/admin must therefore preserve:

- safe payment/subscription persistence and DTOs;
- immutable/historical plan/payment/subscription snapshots where required for audit;
- provider-derived versus manual access origin;
- initial activation/trial versus completed renewal/period behavior;
- reconciliation for provider/Game Arena mismatches;
- safe finance/admin exports with capability separation and audit evidence;
- no provider secrets, MPINs, OTPs, raw secret-bearing webhook payloads or unrestricted PII.

Legacy fixed-duration/direct-JazzCash records may continue to exist historically and must remain distinguishable rather than being silently reinterpreted as external recurring subscriptions.

## Current qualification

Use the exact reviewed PR/main SHA and the active self-managed/local-server staging lane:

1. repository/security/contract checks;
2. API/PostgreSQL/reporting tests;
3. immutable image publication;
4. exact-SHA Docker Compose staging deployment;
5. automated staging certification;
6. real Payment Service staging UAT when payment launch scope requires it;
7. human Admin/reporting UAT;
8. evidence recorded under #48/#165/#166.

Historical AWS/OpenTofu validation may remain as supplemental repository checks but is not a deployment prerequisite for the current launch.

Production remains gated by human UAT and explicit owner authorization; #17 remains relevant for live provider/finance evidence when real charging is enabled.