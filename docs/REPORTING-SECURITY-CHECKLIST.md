# Game Arena+ reporting security checklist

- [ ] Hosted JazzCash checkout fields are returned only to the initiating player and never persisted in transaction records.
- [ ] Administration APIs and CSV exports contain no merchant passwords, integrity salts, secure hashes, raw webhook payloads, OTPs, session tokens or unrestricted identity values.
- [ ] Payment and paid-pass ledgers use safe DTOs and masked customer identities.
- [ ] `reports.read` and `reports.export` are independently enforced by the API.
- [ ] Plan mutation requires `subscription.manage_plans` and a reason.
- [ ] Manual grant, extension and revoke require `subscription.adjust`, a reason and an audit event.
- [ ] Reconciliation execution remains separate from read-only reconciliation reporting and does not provide an arbitrary paid-status override.
- [ ] Report ranges are limited to 366 Pakistan-local days.
- [ ] Ledgers are paginated and use deterministic ordering.
- [ ] Exports over 10,000 rows fail closed with narrowing instructions.
- [ ] CSV formula injection is neutralized.
- [ ] Export audit stores actor, safe filters, row count, schema version and content hash, but not exported customer rows.
- [ ] Report generation remains read-only except for export-audit recording.
- [ ] MRR and ARR remain not applicable while checkout is single-charge.
- [ ] Manual grants never count as collections or paid activations.
- [ ] Strict operations-console CSP remains enabled.
- [ ] Production access remains behind the approved identity-aware MFA/SSO gateway.
