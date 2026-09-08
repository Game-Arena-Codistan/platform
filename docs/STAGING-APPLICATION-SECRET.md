# Staging runtime configuration

## Current storage boundary

The active Game Arena staging environment is the existing self-managed/local-server Docker Compose deployment.

Runtime secrets belong in the protected server environment (for example the protected `infra/.env` consumed by the staging Compose deployment). They do **not** belong in Git, issues, chat, screenshots, frontend runtime config or demo videos.

AWS Secrets Manager is not required for the current launch.

## Core staging configuration

The API/Compose runtime requires the environment-specific values defined by `infra/docker-compose.staging.yml` and `apps/api/.env.example`, including:

- public and allowed origins;
- PostgreSQL password/connection material;
- OTP mode/provider values when enabled;
- Admin proxy/signing configuration;
- top-up/voucher settings where used;
- external Payment Service values when real payment staging UAT begins.

## External Payment Service

Keep external billing disabled until the actual provider values are available:

```text
PAYMENT_SERVICE_MODE=disabled
```

For real staging payment UAT, the authorized operator installs these **server-side only**:

```text
PAYMENT_SERVICE_MODE=external
PAYMENT_SERVICE_URL=...
PAYMENT_SERVICE_API_KEY=...
PAYMENT_SERVICE_WEBHOOK_SECRET=...
PAYMENT_SERVICE_APP_RETURN_URL=https://gsmarena-play.codistan.org/#/premium
PAYMENT_SERVICE_TIMEOUT_MS=8000
```

The Payment Service product must also be configured with the approved monthly/yearly plan catalogue and this webhook target:

`https://gsmarena-play.codistan.org/api/v1/webhooks/payments`

Do not place API keys or webhook secrets in browser-visible environment variables.

## Legacy/direct JazzCash values

The repository still contains direct JazzCash configuration for legacy/non-subscription paths and backwards compatibility. Those values are **not the current Game Arena+ subscription integration**.

Do not configure direct JazzCash merchant credentials for the Premium subscription flow when `PAYMENT_SERVICE_MODE=external` is the approved architecture.

## Safe operator procedure

1. Back up the current protected staging environment file/configuration.
2. Add or update only the approved values.
3. Do not echo secret values into CI logs.
4. Restart/redeploy the API through the normal staging path.
5. Verify readiness without printing environment contents.
6. Run real staging Payment Service UAT.
7. Record only non-sensitive results, IDs and timestamps.
8. Rotate/remove temporary sandbox credentials when required by the provider.

## Production boundary

Staging credentials are not production credentials. Production configuration must be installed separately only after UAT passes and explicit production authorization is given.