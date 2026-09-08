# Frontend–backend handoff contract

## Status

This document describes the current integration boundary for the player PWA, modular-monolith API, PostgreSQL runtime and current self-managed/local-server staging deployment.

- Contract version: `1.0.0`
- Canonical route manifest: `contracts/api/v1/routes.json`
- Canonical preview/test examples: `contracts/api/v1/mock-responses.json`
- Drift check: `node scripts/check-api-contract.mjs`
- Vercel remains preview/mock only.
- Current staging uses the live API through the existing Docker Compose server.
- Production activation remains separate and explicitly approved.

AWS provisioning is not part of the current handoff.

## Environment boundary

| Environment | Frontend | API/data | OTP | Premium payments | Games |
|---|---|---|---|---|---|
| Vercel preview | mock PWA preview | deterministic mock contract | mock | disabled/mock | preview only |
| Local development | local PWA | local API/PostgreSQL | mock/debug | disabled/mock | local controlled origin |
| Current staging | deployed web image | API + persistent PostgreSQL | staging configuration | external Payment Service when enabled | controlled local staging origin |
| Production | exact staging-approved artifact | production API/PostgreSQL | approved provider | approved external Payment Service/provider config | approved controlled-origin catalogue |

No database, OTP, Payment Service, administrator, signing or customer secret belongs in browser-visible configuration.

## Transport and compatibility

- Base API path: `/v1`.
- JSON request/response uses `application/json` unless an endpoint explicitly requires another body type.
- Responses may include `x-request-id`.
- Removing/renaming a field, changing a field type/status or tightening a previously valid request requires contract review/versioning.
- Dates use ISO 8601 unless an existing contract says otherwise.
- Identifiers are opaque strings.

## Authentication and CSRF

Player authentication uses an opaque HttpOnly session cookie.

Authenticated mutations require:

1. the session cookie;
2. the readable CSRF cookie;
3. matching `x-csrf-token`;
4. an allowed `Origin`.

The frontend sends credentials and treats authentication/origin failures as server-authoritative.

Administrator APIs use the separate signed identity/role boundary and server-enforced capabilities.

## Premium payment boundary

Game Arena+ subscriptions use:

`Browser → Game Arena API/BFF → external Payment Service → JazzCash → Payment Service webhook → Game Arena API/PostgreSQL → entitlement`

Frontend rules:

- never call the Payment Service directly;
- never send `userId` as payment authority;
- never send an arbitrary charge amount;
- use BFF plan data/plan codes;
- never activate Premium from redirect/query parameters;
- treat status returned by the Game Arena API as authoritative.

BFF routes are documented in `docs/PAYMENT-SERVICE-INTEGRATION.md`.

The legacy direct JazzCash adapter remains only for unrelated legacy/non-subscription compatibility. Do not use it for the current Game Arena+ subscription flow when external billing is enabled.

## Payment idempotency and webhook authority

- wallet/subscription actions must preserve idempotent/retry-safe behavior;
- the first wallet link must not cause a duplicate subscription create;
- Payment Service webhooks are HMAC-verified on raw bytes and deduped by `eventId`;
- authoritative Payment Service status is reconciled before entitlement changes;
- browser redirects and screenshots are never payment authority.

## Catalogue and game delivery

The catalogue contains metadata only. Game files are served from the controlled staging origin and current local persistent game-content path.

A game is launchable only when runtime/catalogue rollout and eligibility permit it and the exact immutable version is available.

The current exact-60 portfolio is already published/qualified on local staging. Broader migration work is future scope and is not an AWS dependency for the current launch.

## Play proof and rewards

The API remains authoritative for play completion, score/reward policy and wallet changes.

A game may be playable while rewards/competitions remain disabled. Imported titles retain disabled reward/competition policy unless explicit integrity approval changes it.

## Frontend implementation rules

- `mode: 'mock'` is preview/development only.
- live staging calls the Game Arena API and includes credentials.
- frontend code must not talk directly to databases, provider secrets or infrastructure APIs.
- game URLs come from approved controlled-origin catalogue data.
- Premium status comes from authoritative Game Arena API state.

## Backend implementation rules

- PostgreSQL is the durable runtime source of truth;
- acknowledge mutations only after required durable/transactional work succeeds;
- enforce authorization server-side;
- keep external Payment Service credentials server-only;
- keep payment/reward state transitions idempotent and auditable;
- preserve immutable game-version records and rollout/kill-switch controls.

## Handoff test sequence

1. Run contract/security/affected CI checks.
2. Deploy the exact reviewed SHA through the current release → Compose staging workflow.
3. Verify exact image/SHA identity and health.
4. Test anonymous catalogue and account/session journeys.
5. Test controlled game origin and representative games.
6. Test Premium gating with external billing disabled unless real staging credentials are installed.
7. When credentials exist, execute the full real Payment Service UAT under #165.
8. Test Admin/RBAC, persistence/restart and multiplayer/regression behavior.
9. Record evidence under #48.
10. If code changes, deploy/certify the new exact SHA before reusing UAT evidence.

## Change control

Contract changes must update relevant route/mock/frontend/API/tests/docs together. Production remains untouched until human UAT passes and the owner separately authorizes production.