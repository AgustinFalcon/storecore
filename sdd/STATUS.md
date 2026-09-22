# Estado canónico del SDD — StoreCore

**Validado:** 2026-09-22  
**Madurez:** implementation complete for `storecore-core-v1.0.0` (TASK-001..015). Sol GO scoped remains `docs/agent/20260922-sol-go-core.md`. Quality reviews in `sdd/reviews/20260922-task-013-architecture-ux.md`, `20260922-task-014-data-reconciliation.md`, `20260922-task-015-security-release.md`.  
**Git:** deny-by-default; sin commit, tag, publicación ni release.

## Precedencia

1. `sdd/wip/20260921-single-tenant-installation-baseline/`.
2. `sdd/PROJECT.md`, `sdd/PATTERNS.md`, `sdd/TRACEABILITY.md`, `sdd/RELEASE.md`.
3. `docs/agent/` sólo como guía derivada.
4. `20260819-store-tenancy-and-profiles` y `sdd/specs/*` son históricos/superseded.

## Gate actual

Sol GO 2026-09-22 autorizó el baseline core. El grafo TASK-001..015 está complete con evidencia en `sdd/wip/20260921-single-tenant-installation-baseline/evidence/`. No autoriza POS/BlackStore adapter, fiscal/ARCA, tenancy, DEMO-as-production, deploy ni Mercado Pago en el browser.

## WIP POS (paralelo, no es el baseline)

- `sdd/wip/20260921-storecore-pos-integration-contract-v1/` — contrato HTTP canónico `/blackstore-integration/v1`. Documentary PIC GO separado; conector real bloqueado.
- `sdd/wip/20260921-pos-sales-ingestion/` — superseded.
- `sdd/wip/20260921-blackstore-pos-operations/` — puntero histórico.

Estos WIP no se mezclan con `storecore-core-v1.0.0`.

## Fiscal externo — trazabilidad canónica

- `20260921-arca-fiscal-discovery`: `documented_deferred`.
- `20260921-arca-storecore-adapter-contract`: `documented_deferred`.
- Ningún estado fiscal autoriza código, DDL, worker ni secretos.
