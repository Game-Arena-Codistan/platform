# Architecture

The frontend is a dependency-free static web application designed for CDN delivery and low-end mobile devices.

- Hash-based routes avoid server-side rendering requirements.
- Local state is versioned and limited to non-sensitive preview data.
- API adapters support mock and live modes.
- Games run in sandboxed iframes on a separate origin in production.
- The browser never grants premium access or writes Arena Coin balances directly.
- Static assets are served by an unprivileged Nginx container with strict headers.

The backend will begin as a modular monolith backed by PostgreSQL, object storage and a worker/outbox process.
