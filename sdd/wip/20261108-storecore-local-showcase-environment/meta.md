# StoreCore local showcase environment

Feature: `20261108-storecore-local-showcase-environment`
Status: `implemented_local_closeout_pending`
Branch: `codex/storecore-showcase-backend`
Owner: StoreCore core maintainers.

## Objective

Populate a named, disposable local StoreCore installation through the existing
HTTP contracts so the real frontend can be demonstrated with credible data.
This slice does not enable or simulate external providers.

## Authority and boundaries

- `AGENTS.md`, `sdd/PROJECT.md`, `sdd/PATTERNS.md` and the frontend HTTP
  contract remain authoritative.
- The loader uses authenticated APIs. It never writes domain outcomes with SQL.
- ADMIN bootstrap remains interactive and outside the loader.
- Mercado Pago, Mercado Libre, ARCA, Correo Argentino, email delivery and the
  live StoreCore/BlackStore connection remain disabled and out of scope.
- A checkout created by this environment remains honestly
  `PENDING_PAYMENT`; no payment, invoice or shipment is fabricated.

## Documentary close-out residual — 2026-11-09

All task entries record local implementation evidence. This WIP remains unarchived: its final PR candidate review records (provider/model/effort, base/head, scope, checks and limits) must be reconciled in this feature before archive. A green later master or CFE run does not substitute for feature-specific acceptance. Historical pending/failed entries remain preserved.
