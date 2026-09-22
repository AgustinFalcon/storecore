# Estado canónico del SDD — StoreCore

**Validado:** 2026-09-22  
**Madurez:** implementation of the 14-task graph (TASK-001..010, TASK-012..015) is on `feature/storecore-core-v1.0.0` at `e7b4efe`. There is no TASK-011.  
**Sol GO:** `sdd/reviews/20260922-sol-go-core.md` (mirror `docs/agent/20260922-sol-go-core.md`).  
**Git:** commit exists on the feature branch. No tag, deploy or publish.

## Residuales honestos

- TASK-008/014: inbox persist-before-ACK done. Live ML refetch/canonical sale is **TODO-041**, not claimed in CI.
- TASK-013: architecture GO; Playwright/axe/Stitch not automated.
- TODO-003: fleet runbook draft at `2-technical/fleet-operations.md`.

## Precedencia

1. `sdd/wip/20260921-single-tenant-installation-baseline/`.
2. `sdd/PROJECT.md`, `sdd/PATTERNS.md`, `sdd/TRACEABILITY.md`, `sdd/RELEASE.md`.
3. `docs/agent/` is a derived mirror; Sol GO durable record is `sdd/reviews/20260922-sol-go-core.md`.
4. `20260819-store-tenancy-and-profiles` y `sdd/specs/*` son históricos/superseded.

## Gate actual

Sol GO autorizó el baseline core. No autoriza POS/BlackStore adapter, fiscal/ARCA, tenancy, DEMO-as-production, deploy ni Mercado Pago en el browser. `/sdd.finish` espera reviews Grok 4.7 sin P0.

## WIP POS (paralelo, no es el baseline)

- `sdd/wip/20260921-storecore-pos-integration-contract-v1/` — contrato HTTP canónico. Documentary only; conector real bloqueado.
- `sdd/wip/20260921-pos-sales-ingestion/` — superseded.
- `sdd/wip/20260921-blackstore-pos-operations/` — puntero histórico.

## Fiscal externo

- `20260921-arca-fiscal-discovery` y `20260921-arca-storecore-adapter-contract`: `documented_deferred`. Sin código, DDL, worker ni secretos.
