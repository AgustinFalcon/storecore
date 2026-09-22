# Sol GO — storecore-core-v1.0.0

**Date:** 2026-09-22  
**Record:** durable copy. The agent path `docs/agent/20260922-sol-go-core.md` is the same text.

## GO (implementation)

Sol authorized Luna to implement the 14-task graph TASK-001..010 and TASK-012..015 for a single-tenant installation (one merchant, one PostgreSQL, one domain).

## In scope

- USER and CUSTOMER as separate identities/cookies/routes.
- Cookie sessions + CSRF. No Bearer/JWT in the browser.
- Catalog, cart, checkout (ARS, claim snapshot, request_hash), WEB inventory, manual promos/fulfillment, profile import.
- ML/MP: official-contract validation, persist inbox before ACK. No invented webhook HMAC.

## Residual (not this GO)

- Live ML/MP refetch, canonical sale apply, outbox workers: TODO-041.
- Playwright/axe/Stitch a11y: residual on TASK-013.
- Fleet backup/rollback runbook: TODO-003 (documentary).
- POS/BlackStore adapter, fiscal/ARCA, tenancy SaaS, deploy, tag, publish: not authorized.

## Evidence of this GO

- Commit `e7b4efe` on `feature/storecore-core-v1.0.0`.
- Backend `mvn test` and frontend 42 unit tests green on 2026-09-22.
