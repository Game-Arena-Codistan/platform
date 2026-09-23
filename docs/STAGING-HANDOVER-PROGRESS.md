# Game Arena Staging Handover — Requirements & Progress

**Baseline status:** `STAGING DEPLOYED — UAT PENDING`  
**Audit baseline:** 7 September 2026 (handover doc)  
**Client writeup received:** 23 September 2026  
**Progress owner:** _TBD_  
**Last updated:** 2026-09-23 (payments deferred by client — non-payment UAT in progress)

---

## 1. Goal (final end-state)

```text
staging deployed → payments working → video shared → complete UAT passed → issues fixed → staging ready for production approval
```

Allowed highest status after this work: **`READY FOR PRODUCTION APPROVAL`**.  
**Production/live must not be touched** until a separate explicit owner authorization.

---

## 2. Fixed context (do not redo)

| Item | Value | Progress |
|---|---|---|
| Repository | https://github.com/Game-Arena-Codistan/platform | ✅ Known |
| Staging URL | https://gsmarena-play.codistan.org | ✅ Known |
| **Client-confirmed staging/UAT SHA** | `6fa6ef8ca6a8945a6aa7d577f39c61fe266d92f9` | ✅ Confirmed by client 2026-09-23 — **do not roll back to `9450382…`** |
| Deploy/certification evidence (current) | [34270960584](https://github.com/Game-Arena-Codistan/platform/actions/runs/34270960584) | ✅ Client-provided |
| Master launch gate | [#48](https://github.com/Game-Arena-Codistan/platform/issues/48) | ✅ |
| Payment UAT / cert | [#165](https://github.com/Game-Arena-Codistan/platform/issues/165) / [#166](https://github.com/Game-Arena-Codistan/platform/issues/166) | ⏸ Deferred locally until OTP/non-payment UAT catch-up |
| Older handover SHA (historical) | `94503823601f31a2776ecf7ed568591493241bf9` | ⛔ Superseded — do not use |
| Payment software | Code complete; `READY FOR STAGING UAT` | ✅ Known |
| Deployment lane | Self-hosted Docker Compose (not AWS/EKS/S3) | ✅ Known |
| GitLab | N/A — not used | ✅ Known |
| Production | Untouched / not authorized | ✅ Guardrail |

**Do not:** rebuild AWS infrastructure, request AWS credentials, migrate 140/300–500 games, or treat Vercel mock as staging evidence.

---

## 3. Requirements summary

### A. Hard constraints

1. Work **only on staging**. No production deploy, env, DB, or live charging.
2. Keep secrets off GitHub, chat, screenshots, browser config, and demo video.
3. Prefer **configuration + UAT** over new feature coding unless a real provider/contract defect is found.
4. Any code fix: branch → PR → CI → immutable images → redeploy **new exact SHA** → re-certify → retest failed + critical regression cases.
5. Do not enable Premium from browser redirect/query params; API/PostgreSQL entitlement is authoritative.

### B. Priority 1 — Real Payment Service / JazzCash on staging

> **LOCAL WORKING DECISION (2026-09-23): SKIP payment work for now** even though the client later confirmed payment UAT remains in overall scope. Continue OTP fix → non-payment UAT first; resume payments after login/UAT catch-up.

> **CLIENT UPDATE (2026-09-23):** Staging baseline SHA is confirmed as `6fa6ef8…` (do not roll back). Client still wants payment config + full payment UAT + demo video as launch scope — tracked under #165/#166 — but local execution of payments remains deferred until auth/non-payment lanes are unblocked.

External inputs required (server-side only):

| Config | Where | Secret? | Status |
|---|---|---|---|
| `PAYMENT_SERVICE_MODE=external` | API | No | ⬜ |
| `PAYMENT_SERVICE_URL` | API | No | ⬜ Awaiting DevOps/payment owner |
| `PAYMENT_SERVICE_API_KEY` | API | Yes | ⬜ |
| `PAYMENT_SERVICE_WEBHOOK_SECRET` | API | Yes | ⬜ |
| `PAYMENT_SERVICE_APP_RETURN_URL=https://gsmarena-play.codistan.org/#/premium` | API | No | ⬜ |
| `PAYMENT_SERVICE_TIMEOUT_MS=8000` | API | No | ⬜ |
| Webhook registration → `https://gsmarena-play.codistan.org/api/v1/webhooks/payments` | Payment Service | No | ⬜ |
| Approved monthly/yearly plan catalogue/prices | Payment Service | No | ⬜ |
| Sandbox JazzCash wallet / MSISDN (if required) | Provider | Yes | ⬜ |

Must verify end-to-end:

- [ ] Wallet linking (MSISDN + consent → hosted JazzCash/sandbox → return)
- [ ] Monthly subscription / trial create (no duplicate create)
- [ ] Yearly subscription flow
- [ ] Authoritative Premium entitlement activation
- [ ] Account status + payment history
- [ ] Cancel (renewal stops; paid-period retention per authoritative state)
- [ ] Unlink wallet (future debits stop)
- [ ] Failure / past-due / recovery where sandbox supports it
- [ ] Webhook: valid, duplicate/idempotent, invalid signature rejected
- [ ] No secrets/tokens/MPIN in browser, logs, screenshots, or video

Tracked issues: **#158** (epic), **#165** (real UAT), **#166** (certification closure).

Architecture:

```text
Browser → Game Arena API/BFF → Payment Service → JazzCash
       → Payment Service webhook → Game Arena API/PostgreSQL → entitlement
```

### C. Priority 2 — Stakeholder demo video (after payments work)

> **CLIENT DECISION (2026-09-23): SKIP with payments.** Demo video depends on payment walkthrough; deferred until payment UAT resumes.

Short non-sensitive video showing:

- [ ] Login
- [ ] Plan selection
- [ ] Payment / wallet flow (no MPIN/secrets)
- [ ] Successful Premium activation
- [ ] Account / payment status
- [ ] Cancel / unlink
- [ ] Mobile / responsive view

### D. Priority 3 — Full manual UAT (exact deployed SHA)

| Area | Scope | Status |
|---|---|---|
| Frontend / player | Home, catalogue, auth, account, free/premium gate, rewards, competition, support | ⬜ |
| Backend / API | Readiness, billing routes, entitlement, webhooks, persistence | ⬜ |
| Admin | Roles, reports, exports, no privilege leakage | ⬜ |
| All 60 games | Load, controls, audio, orientation, exit, eligibility, mobile | ⬜ |
| Multiplayer | Tank Wars create + rejoin | ⬜ |
| Mobile / browsers | Mobile width, Chrome + Firefox, WebKit-equivalent | ⬜ |
| Security | No secret leakage in network/bundle/logs | ⬜ |
| Persistence / restart | Acknowledged state survives API restart | ⬜ |
| Regression | Critical flows after any fix | ⬜ |

### E. Defect fix loop

For every issue found:

1. Reproduce on staging; record exact SHA.
2. Capture steps, screenshots/video, console/network, safe correlation IDs.
3. Classify: code / config / deploy / infra / test data / third party.
4. Fix via PR (if code); never patch production or weaken tests.
5. Redeploy new SHA; retest defect + critical regression.
6. Update this progress file; never mark fixed from source-only change.

### F. Exit deliverable (staging completion pack)

Return **without secrets**:

1. Exact GitHub SHA(s) deployed  
2. GitLab: `N/A — GitLab not used`  
3. CI / image pipeline ID(s)  
4. Deploy + certification run ID(s)  
5. Staging URL + runtime SHA confirmation  
6. Completed UAT checklist + 60-game matrix  
7. Screenshots / evidence references  
8. Payment demo video  
9. Bugs found  
10. Bugs fixed (PR/SHA each)  
11. Remaining external blockers  
12. One allowed final status (see §7)

---

## 4. Step-by-step execution plan

### Phase 0 — Confirm staging baseline (Day 0)

| # | Step | Owner | Status | Notes / evidence |
|---|---|---|---|---|
| 0.1 | Confirm staging still serves SHA `9450382…` (or record newer SHA if already redeployed) | Dev | ✅ | **Mismatch:** live `releaseSha` = `6fa6ef8ca6a8945a6aa7d577f39c61fe266d92f9` via `/config.js` (checked 2026-09-23). Handover SHA `9450382…` is no longer what the player shell reports. |
| 0.2 | Confirm `/api/readyz` healthy | Dev | ✅ | HTTP 200 `{"status":"ready","catalogue":64,"payments":"mock","otp":"brevo","competitions":true}` |
| 0.3 | Confirm catalogue/home loads; Admin remains private | Dev | ✅ | `/` HTTP 200 (PWA HTML); `/api/v1/catalog/games` HTTP 200. Admin not probed publicly (intentionally private). |
| 0.4 | Confirm AWS is **out of scope** for this handover | Dev | ✅ | Proceeding on Compose staging only. |
| 0.5 | Set progress status → `STAGING UAT IN PROGRESS` | Dev | ✅ | Updated this file 2026-09-23. Still need #48 comment with non-sensitive evidence. |

### Phase 1 — Obtain payment external inputs (blocker until done)

| # | Step | Owner | Status | Notes / evidence |
|---|---|---|---|---|
| 1.1 | Request Payment Service staging URL | DevOps / PS owner | ⬜ | Non-secret OK in issues |
| 1.2 | Request product API key (server-only handoff) | DevOps / PS owner | ⬜ | Never commit |
| 1.3 | Request matching webhook secret | DevOps / PS owner | ⬜ | Never commit |
| 1.4 | Confirm webhook registered to staging endpoint | DevOps / PS owner | ⬜ | |
| 1.5 | Confirm approved monthly/yearly plans & prices | Product / stakeholder | ⬜ | Do not hard-code amounts |
| 1.6 | Obtain sandbox MSISDN / JazzCash test wallet | Provider / finance | ⬜ | |
| 1.7 | Confirm return URL + origin allowlists | DevOps | ⬜ | |

### Phase 2 — Configure staging (no code change expected)

| # | Step | Owner | Status | Notes / evidence |
|---|---|---|---|---|
| 2.1 | Install env vars on **API/server only** | DevOps | ⬜ | See §3B |
| 2.2 | Set `PAYMENT_SERVICE_MODE=external` | DevOps | ⬜ | Only when all values present |
| 2.3 | Restart API; confirm `readyz` still green | DevOps / Dev | ⬜ | |
| 2.4 | Confirm secrets not in web container / browser | Dev | ⬜ | DevTools check |
| 2.5 | Keep source SHA unchanged unless defect found | All | ⬜ | |

### Phase 3 — Critical payment smoke (#165 start)

| # | Step | Status | Evidence |
|---|---|---|---|
| 3.1 | Login with staging test user | ⬜ | |
| 3.2 | `GET /api/v1/billing/plans` returns monthly/yearly | ⬜ | |
| 3.3 | Select monthly; MSISDN + consent | ⬜ | |
| 3.4 | Wallet link → hosted JazzCash/sandbox return | ⬜ | |
| 3.5 | Browser return alone does **not** grant Premium | ⬜ | |
| 3.6 | Authoritative status/webhook → entitlement | ⬜ | |
| 3.7 | Premium title launch works | ⬜ | |
| 3.8 | Account status + payment history | ⬜ | |

**Gate:** If smoke fails, stop full UAT; classify and fix (config vs code).

### Phase 4 — Full payment UAT (#165 → #166)

| # | Step | Status | Evidence |
|---|---|---|---|
| 4.1 | First subscription without duplicate create | ⬜ | |
| 4.2 | Cancel subscription behavior | ⬜ | |
| 4.3 | Unlink wallet behavior | ⬜ | |
| 4.4 | Failure / past-due / recovery (sandbox) | ⬜ | |
| 4.5 | Webhook duplicate idempotency | ⬜ | |
| 4.6 | Invalid webhook signature/type rejected | ⬜ | |
| 4.7 | Yearly plan full flow | ⬜ | |
| 4.8 | Desktop + mobile payment UX | ⬜ | |
| 4.9 | Secret non-exposure check | ⬜ | |
| 4.10 | Mark #165 evidence complete; advance #166 toward `STAGING UAT PASSED` for payments | ⬜ | |

### Phase 5 — Stakeholder demo video

| # | Step | Status | Notes |
|---|---|---|---|
| 5.1 | Record short walkthrough (login → Premium → cancel/unlink → mobile) | ⬜ | No secrets/MPIN |
| 5.2 | Store/share non-sensitive link; reference in #48 / completion pack | ⬜ | |

### Phase 6 — Full manual UAT matrix

Use handover §9 scenarios. Track pass/fail here:

> Payment-related rows deferred by client (2026-09-23). Non-payment UAT in progress against live SHA `6fa6ef8…`.

| Scenario | P/F | Evidence | Notes |
|---|---|---|---|
| Player/Home | P | Browser `#/home` loads; hero + nav OK | 2026-09-23 |
| Catalogue | P / note | `#/library` loads; search/genres/Play vs Unlock visible | Library placeholder says “Search 43 games” while API returns 64 — investigate filter/count |
| Authentication | F | OTP Send shows “Unexpected server error” | UI still advertises Demo OTP `123456` while `readyz` reports `otp:brevo` — auth blocker for signed-in UAT |
| Account | P (guest) | `#/account` Guest player, preferences, membership copy | Full sessions/export needs successful login |
| Free game launch | BLOCKED | Play on free title opens Sign in | Cannot complete without working OTP |
| Premium gate (free user) | P (partial) | Arena+ titles show Unlock; `#/premium` shows Monthly/Yearly | Full gate-after-login deferred with payments/auth |
| Multiplayer (Tank Wars) | BLOCKED | Compete → Multiplayer UI lists rooms; Create room → Sign in | Need working OTP to create/rejoin |
| Rewards / wallet | P (guest) | `#/rewards` shows coins/challenges; wallet activity asks sign-in | Authenticated wallet pending OTP |
| Competition hub | P (guest) | Leaderboards / Multiplayer / Tournaments tabs render | Authenticated actions pending |
| Support request | ⬜ | | Not exercised yet |
| Payment plans | SKIP | Client deferred | `GET /api/v1/billing/plans` → `enabled:false, mode:disabled` (expected) |
| Wallet linking | SKIP | Client deferred | |
| First subscription | SKIP | Client deferred | |
| Entitlement / premium launch | SKIP | Client deferred | |
| Payment history | SKIP | Client deferred | |
| Cancel | SKIP | Client deferred | |
| Unlink | SKIP | Client deferred | |
| Failure/past due | SKIP | Client deferred | |
| Webhook security | SKIP | Client deferred | |
| Admin login/roles | BLOCKED | Admin is private loopback / signed-role | Needs DevOps tunnel + signed identity access |
| Admin reports/exports | BLOCKED | Same as above | |
| Privacy/security | P (partial) | `/config.js` has no apiKey/webhook/secret; browser config keys safe | Auth/session secret checks need login |
| Persistence/restart | BLOCKED | Requires staging host SSH/Compose restart | Ask DevOps for restart proof or access |
| Mobile | P (partial) | Emulated 390×844 library/nav usable | Full play tests need OTP |
| Desktop Chrome + Firefox | P (partial) | Chromium automation desktop paths OK | Firefox not yet run |
| WebKit / iPhone equivalent | ⬜ | | Pending |

#### 60-game matrix

| Range | Complete | Defect refs |
|---|---|---|
| Controlled-origin entrypoints (60/60 HEAD 200) | ✅ asset reachability | Full interactive play matrix still pending (needs OTP + manual play) |
| External URL leftovers (3) | ❌ | UAT-GAMES-EXT-522 |
| Games 1–20 interactive play | ⬜ | Blocked on auth for in-shell launch |
| Games 21–40 interactive play | ⬜ | |
| Games 41–60 interactive play | ⬜ | |

**Asset reachability (2026-09-23):** exact-60 controlled `/games/<slug>/<version>/...` all HTTP 200. Demo `arena-dash` 200. Three catalogue rows still point at dead external host `games.codistan.org` and return **HTTP 522**: `mathgame-for-kids`, `quickdice`, `touchball` (near-duplicates of healthy controlled titles `math-game-for-kids`, `quick-dice`, `touch-ball`).

Controlled 60 metadata: rewardsEnabled=0, competitionsEnabled=0 (as expected for imported portfolio).

### Phase 7 — Fix / retest loop (as needed)

| Defect ID | SHA found | Classification | PR / new SHA | Retest | Closed |
|---|---|---|---|---|---|
| UAT-AUTH-OTP-500 | `6fa6ef8…` | Code + staging config | Local Demo OTP fix prepared (needs PR/deploy) | ⬜ | ⬜ Fixed locally: `ALLOW_DEBUG_OTP` → code `123456` + mock delivery fallback. Live staging still broken until redeploy. |
| UAT-GAMES-EXT-522 | `6fa6ef8…` | Catalogue / data | — | ⬜ | ⬜ 3 external `games.codistan.org` URLs return 522; remove or remap to controlled origin |
| UAT-LIB-COUNT-43 | `6fa6ef8…` | Frontend / catalogue filter | — | ⬜ | ⬜ Library search placeholder “43 games” vs API 64 |

### Phase 8 — Completion pack & status

| # | Deliverable | Status |
|---|---|---|
| 8.1 | Exact final SHA + runtime identity | ⬜ |
| 8.2 | Release / deploy / certification run IDs | ⬜ |
| 8.3 | UAT checklist + 60-game matrix complete | ⬜ |
| 8.4 | Demo video shared | ⬜ |
| 8.5 | Bugs found/fixed list | ⬜ |
| 8.6 | External blockers (if any) listed | ⬜ |
| 8.7 | Status → `READY FOR PRODUCTION APPROVAL` (if all pass) | ⬜ |
| 8.8 | Update issues #48, #165, #166, #158 with non-sensitive evidence | ⬜ |

---

## 5. Definition of Done checklist

### A. Source
- [ ] Exact GitHub candidate confirmed
- [ ] Monorepo apps accounted for
- [ ] No unexplained open release PR
- [ ] GitLab marked N/A

### B. Deployment
- [ ] Immutable images for final SHA
- [ ] Staging deploy for same SHA
- [ ] Runtime identity matches
- [ ] No production action

### C. Configuration
- [ ] Payment Service staging values installed privately
- [ ] Webhook registered
- [ ] Plan catalogue confirmed
- [ ] Origins / OTP / DB / Admin settings preserved

### D. Priority payment flow
- [ ] Monthly E2E
- [ ] Entitlement + premium launch
- [ ] History / cancel / unlink
- [ ] Failure/past-due + webhook idempotency
- [ ] Yearly E2E

### E. UAT
- [ ] Player frontend
- [ ] Backend/API
- [ ] Admin
- [ ] 60-game matrix
- [ ] Mobile/desktop/WebKit-equivalent
- [ ] Security boundaries
- [ ] No unresolved critical/high

### F. Final evidence
- [ ] SHA recorded
- [ ] Pipeline/run IDs recorded
- [ ] Checklist completed
- [ ] Screenshots stored
- [ ] Demo recorded
- [ ] Human UAT approval reference
- [ ] Status = `READY FOR PRODUCTION APPROVAL` (not “production approved”)

---

## 6. Out of scope / do not reopen

| Item | Direction |
|---|---|
| AWS / EKS / S3 / #141 | Deferred; not required |
| 140 / 300–500 game roadmap (#73/#77/#78) | Phase 2 |
| Direct JazzCash Premium path | Not current Game Arena+ architecture |
| Production cutover | Separate explicit authorization |
| Stale PR #151 | Do not merge (superseded) |
| Force-push / rewrite `main` | Forbidden |

---

## 7. Allowed status values

Use **exactly one**:

| Status | When |
|---|---|
| `NOT READY FOR STAGING` | Staging not usable |
| `READY FOR STAGING DEPLOYMENT` | Code ready, not deployed |
| `STAGING DEPLOYED — UAT PENDING` | **Current baseline** until UAT starts |
| `STAGING UAT IN PROGRESS` | Payment config + UAT underway |
| `STAGING UAT PASSED` | Full UAT passed for exact SHA |
| `READY FOR STAKEHOLDER REVIEW` | Demo/evidence ready for review |
| `READY FOR PRODUCTION APPROVAL` | Highest allowed by this handover |

**Current working status:** `STAGING UAT IN PROGRESS` (baseline SHA `6fa6ef8…` client-confirmed; Demo OTP code fix pending deploy; payments still deferred locally)

> **SHA note (2026-09-23):** Live staging `releaseSha` is `6fa6ef8ca6a8945a6aa7d577f39c61fe266d92f9`, **not** the handover SHA `94503823601f31a2776ecf7ed568591493241bf9`. Treat `6fa6ef8…` as the current UAT baseline unless DevOps reverts or documents otherwise.

---

## 8. Key references

| Resource | Link |
|---|---|
| Handover source | `resources/Game_Arena_Developer_Handover_Staging.docx` |
| Payment integration | `docs/PAYMENT-SERVICE-INTEGRATION.md` |
| Staging secrets guide | `docs/STAGING-APPLICATION-SECRET.md` |
| Backend handoff | `docs/BACKEND-HANDOFF.md` |
| Production readiness | `docs/PRODUCTION-READINESS.md` |
| Master gate #48 | https://github.com/Game-Arena-Codistan/platform/issues/48 |
| Payment epic #158 | https://github.com/Game-Arena-Codistan/platform/issues/158 |
| Payment UAT #165 | https://github.com/Game-Arena-Codistan/platform/issues/165 |
| Payment cert #166 | https://github.com/Game-Arena-Codistan/platform/issues/166 |

---

## 9. Daily progress log

| Date | Update | Blockers | Next action |
|---|---|---|---|
| 2026-09-23 | Requirements extracted from client writeup + handover doc; this progress file created | Payment Service staging credentials not yet installed | Confirm SHA on staging; request Phase 1 external inputs |
| 2026-09-23 | Phase 0 baseline checks run against live staging | External Payment Service credentials still missing; payments still `mock` | Ask DevOps for Payment Service staging inputs (Phase 1); clarify why SHA is `6fa6ef8…` vs handover `9450382…` |
| 2026-09-23 | Client deferred payments + payment demo. Started non-payment UAT | OTP Send fails (Unexpected server error); Admin private; persistence needs host access; 3 external game URLs 522 | Fix/get working staging OTP; remove/remap 3 dead external catalogue URLs; obtain Admin + restart access for remaining UAT |
| 2026-09-23 | Client confirmed staging SHA `6fa6ef8…` + cert run 34270960584; do not roll back. Code change: Demo OTP `123456` + mock delivery fallback when `ALLOW_DEBUG_OTP=true` | Live staging still on old OTP behavior until this SHA is deployed | Commit/PR → deploy new SHA → retest login with Demo OTP → resume non-payment UAT. Payments still skipped locally. |
| 2026-09-23 | Local OTP E2E passed on API `:18081` with `OTP_PROVIDER_MODE=brevo` + empty Brevo keys + `ALLOW_DEBUG_OTP=true`: request 202/`debugCode=123456`, verify 200, session authenticated, wrong OTP 400, email path OK | Staging still needs deploy of this fix | Commit/PR/redeploy when ready |
| | | | |
