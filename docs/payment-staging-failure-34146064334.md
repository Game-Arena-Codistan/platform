# Payment staging certification failure — run 34146064334

Exact deployed SHA: `8fa99c64db53369d6a9e6957d7bf8f858e30eca6`

The deployment itself succeeded. API/business, extended media/premium/competition/mock-payment, restart durability, browser setup and visual capture execution all ran. Final certification failed because the browser suite reported 13 failures.

Root causes identified from sanitized logs:

1. `bindPremium()` awaited the billing-plan probe before binding plan click handlers, creating a guest interaction race.
2. The fallback Premium page showed external-wallet trust copy even when `PAYMENT_SERVICE_MODE` was disabled; old fixed-duration staging assertions therefore no longer matched the actual fallback mode.
3. Billing probes returned 404 when external mode was disabled, creating material browser-console failures in unrelated signed-in journeys.
4. The Admin SSH tunnel was initially healthy but dropped before late-running Admin tests; add SSH keepalive options for the longer suite.
5. Browser-return safety test registered the legacy checkout response waiter after the click, allowing a request race.

The fixes must preserve:
- external billing behind the server-only payment-service mode;
- legacy fixed-duration fallback when external payment configuration is absent;
- no production activation;
- exact staging deployment/certification after merge.
