# StoreCore local showcase environment

Feature: `20261108-storecore-local-showcase-environment`
Status: `implementation_in_progress`
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
