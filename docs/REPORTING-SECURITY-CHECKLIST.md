# Game Arena+ reporting security checklist

- [ ] Payment Service API key and webhook shared secret remain server-only and never appear in Admin/browser/export responses.
- [ ] Wallet MPINs, provider tokens and raw secret-bearing webhook/provider payloads are never persisted in report DTOs or exports.
- [ ] Administration APIs/CSV exports contain no OTPs, session tokens, unrestricted identity values or provider credentials.
- [ ] Payment/subscription ledgers use safe DTOs and masked customer identity where appropriate.
- [ ] Browser-supplied `userId` or payment amount is never reporting/payment authority.
- [ ] Plan code/price comes from the authoritative server/Payment Service catalogue when external billing is enabled.
- [ ] `reports.read` and `reports.export` remain independently enforced by the API.
- [ ] Plan/subscription adjustment capabilities are separately authorized and audited.
- [ ] Reconciliation execution remains separate from read-only reconciliation reporting and cannot arbitrarily mark a provider payment successful.
- [ ] Report ranges/pages/exports are bounded and deterministically ordered.
- [ ] CSV formula injection remains neutralized.
- [ ] Export audit stores actor, safe filters, row count/schema/content hash without storing the exported customer rows.
- [ ] Report generation is read-only except for approved export-audit recording.
- [ ] Initial activation/trial, completed paid periods/renewals and manual grants remain distinguishable.
- [ ] MRR/ARR/recurring-customer labels are shown only when authoritative provider behavior, persisted renewal evidence and finance definitions support them.
- [ ] Manual grants never count as provider collections or paid activations.
- [ ] Strict operations-console CSP remains enabled.
- [ ] Deployed Admin access remains behind the approved signed identity/role/capability boundary.
- [ ] Current staging verification uses the self-managed/local-server Docker Compose environment; AWS provisioning is not required for this checklist.

See `docs/PAYMENT-SERVICE-INTEGRATION.md`, `docs/SUBSCRIPTION-REPORTING.md` and `docs/THREAT-MODEL.md`.