# Game Arena product

Game Arena is a mobile-first HTML5 gaming platform for Pakistan. Guests can discover and play selected games with minimal friction, then sign in by OTP when an account is required.

## Commercial model

- Free: selected catalogue, standard rewards, basic leaderboards and approved promotional/ad-supported behavior.
- Game Arena+: full catalogue access and the approved premium benefits configured for the launch product.
- Game Arena+ supports monthly/yearly plan options through the external Payment Service.

When external billing is enabled, **plan codes, prices, currency and current availability come from the Payment Service product catalogue**. Hard-coded frontend prices are not the source of truth and the browser never sends an arbitrary charge amount.

## Premium payment model

Current architecture:

`Browser → Game Arena API/BFF → external Payment Service → JazzCash → Payment Service webhook → Game Arena API/PostgreSQL → entitlement`

Game Arena never activates Premium from a browser redirect alone.

See `docs/PAYMENT-SERVICE-INTEGRATION.md` and `docs/PAYMENTS.md`.

## Current launch scope

The current exact-60 portfolio is deployed to the controlled local staging origin. The launch path is the existing self-managed/local-server Docker Compose environment.

Remaining launch work is real payment staging UAT when paid launch is in scope, full human/manual UAT, defect fixes/retest and explicit production approval.