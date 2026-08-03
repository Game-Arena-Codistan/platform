# Architecture decisions

Use an architecture decision record when a change alters a durable platform boundary, introduces a new runtime or data store, changes trust or authorization assumptions, or creates a long-lived operational dependency.

Routine feature implementation, bug fixes and reversible configuration changes do not need an ADR when they remain inside the established architecture.

## Required ADR topics

Create an ADR before:

- splitting the modular monolith or introducing a new service, queue or scheduled runtime;
- adding a database, cache, warehouse or external system of record;
- changing authentication, authorization, payment or reward trust boundaries;
- changing the controlled game-origin or Game Bridge model;
- introducing recurring billing or materially changing entitlement semantics;
- changing how game source, rights, artifacts or certification records are stored;
- replacing the AWS, Vercel or CI operating model;
- accepting a security, reliability or cost trade-off that future contributors must understand.

## Workflow

1. Copy `000-template.md` to the next sequential number and a short kebab-case title.
2. Set the status to `Proposed` and link the owning issue and pull request.
3. Describe context, decision drivers, considered options and consequences.
4. Include security, privacy, cost, migration, rollback and operational effects.
5. Obtain the relevant code-owner and business/operations review.
6. Change status to `Accepted` only when the implementation direction is approved.
7. Mark an ADR `Superseded` and link its replacement rather than rewriting history.

## Status values

- `Proposed`
- `Accepted`
- `Rejected`
- `Deprecated`
- `Superseded by ADR-NNN`

## Current architecture baseline

Until an accepted ADR changes it:

- the backend is a modular monolith;
- normalized PostgreSQL is the deployed source of truth;
- static games are immutable controlled-origin artifacts, not per-game services;
- Game Bridge is the versioned boundary between games and the platform;
- payments, entitlements, rewards and administration are server-authoritative;
- Vercel is the deterministic mock-preview lane;
- AWS staging and production are protected, OIDC-based environments.