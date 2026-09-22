# Backlog — StoreCore

## Bloqueantes

- TODO-001 [critical] [done] Sol GO de `storecore-core-v1.0.0` (`sdd/reviews/20260922-sol-go-core.md`).
- TODO-002 [critical] [done] Flyway/Testcontainers V1–V3 del schema core single-tenant.
- TODO-003 [critical] Fleet inventory, backup/restore y rollback por VM. Draft: `sdd/features/20260921-single-tenant-installation-baseline/2-technical/fleet-operations.md`.
- TODO-041 [high] [residual] ML/MP live refetch + canonical sale apply + outbox/reconcile worker. Requires official credentials configured per installation. No invented HMAC. Not in core v1 CI.

## Features diferidos (no ejecutables en core 1.0.0)

- TODO-020 [high] [blocked] `external-fiscal-adapter`: biblioteca/repositorio externo conforme y auditable; D-01..D-07, titular/contador y Sol GO. Sin DDL/tarea fiscal StoreCore y nunca ventas ocultas/evasión.
- TODO-030 [medium] [deferred] `ml-competition-insights`: sólo señales oficiales/licenciadas read-only, fuente/fecha/confianza. Rechaza premisa top-5 y scraping.
- TODO-031 [high] [deferred] `ml-price-automation-management`: APIs oficiales; opt-in por listing, min/max, margen, cooldown, auditoría, kill switch y exclusión mutua con writer local.
- TODO-032 [high] [deferred] `ml-promotion-orchestrator`: candidatos/ofertas/promos oficiales, eligibility/preflight, aprobación humana o preautorización acotada, margen, rollback/reconcile; no promo por scraping.
- TODO-033 [medium] [deferred] `web-cross-sell-discounts`: relación de productos, elegibilidad, descuento, stacking/prioridad/margen, snapshots/reversal. ML virtual kits separado.
- TODO-034 [medium] [deferred] `commercial-calendar`: eventos/campañas definidos por merchant, timezone/preflight/activación/kill switch/rollback; Black Friday configurable, nunca autónomo/hardcodeado.
- TODO-035 [medium] [deferred] ML virtual kits.
- TODO-036 [low] [deferred] Favorites.
- TODO-037 [medium] [deferred] Loyalty ledger.
- TODO-038 [medium] [deferred] Integraciones reales de carrier.
- TODO-039 [high] [superseded] `pos-sales-ingestion`: ISSUE/REVERSAL superseded. Ver TODO-040.
- TODO-040 [high] [blocked] `storecore-pos-integration-contract-v1`: OpenAPI canónico en `sdd/wip/20260921-storecore-pos-integration-contract-v1/`. `ready_for_sol_review`, no approved. Sin conector real ni Flyway hasta Sol GO. No altera las 14 tasks de core 1.0.0.

## Histórico

`store-tenancy-and-profiles` permanece superseded y sólo puede reabrirse como iniciativa SaaS mediante nueva review Sol.
