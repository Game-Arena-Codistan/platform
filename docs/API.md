# API contracts

Public: `GET /healthz`, `GET /v1/catalog/games`, `POST /v1/auth/otp`, `POST /v1/auth/otp/verify`.

Authenticated: `GET /v1/session`, `POST /v1/auth/logout`, `GET /v1/entitlements/me`, `POST /v1/payments/jazzcash/checkout`, `GET /v1/wallet`, `POST /v1/play-sessions`, `POST /v1/play-sessions/:id/complete`.

Provider: `POST /v1/payments/jazzcash/webhook`.

Errors use `{ "error": { "code", "message", "requestId" } }`. State-changing operations are server-authoritative and idempotent.
