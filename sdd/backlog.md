# Backlog — StoreCore

## Bloqueantes

- TODO-001 [critical] [done] Sol GO de `storecore-core-v1.0.0` (`sdd/reviews/20260922-sol-go-core.md`).
- TODO-002 [critical] [done] Flyway/Testcontainers V1–V3 del schema core single-tenant.
- TODO-003 [critical] [done] Fleet inventory, backup/restore y rollback por VM. Runbook: `sdd/features/20260921-single-tenant-installation-baseline/2-technical/fleet-operations.md`.
- TODO-041 [high] [done] Inbox application worker: official refetch port + payment/ML apply + outbox. Unconfigured installations stay RECEIVED. CI uses a fake official resource. No live vendor call and no invented HMAC.

## Features diferidos (no ejecutables en core 1.0.0)

- TODO-044 [high] [in_progress] `commerce-closed-states-and-fulfillment-eligibility`: PR #171 MERGED (head `b3e4b3b`, merge `84f1b025`); Verify exact-head `37630043935` frontend/backend/unified-access-real-e2e success; dual GPT-6.1 Sol APPROVED sin P0–P3 sobre fingerprint `459CB299E61B864DB52A5B3E2FB676BC213BA1C94307731BAC5E54F115647572`. Browser CFE específico, clean/upgrade y aceptación no acreditada pendientes. No CI push master, archive, homologación ni activación; ver WIP 20261006.
- TODO-045 [high] [deferred] `commerce-rma-item-disposition-and-restock`: outcomes/cantidades por ítem, inspección auditada, separación dañado/rechazado, idempotencia de ledger y carreras/reversión. Requiere feature y Sol GO propios; no tarea ejecutable aquí. Recepción CFE no habilita INSPECTED/ADJUSTED ni RESTOCK.

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
- TODO-040 [high] [blocked] `storecore-pos-integration-contract-v1`: PIC-001..010 + L3 locales done; módulo vuelve a DISABLED. Companion live y activación siguen NO-GO. BlackStore ADP-001..010 + L3 locales done; dual Grok APPROVED; release disabled. No altera las 14 tasks de core 1.0.0.
- TODO-042 [high] [blocked] `storecore-mp-live-checkout-v1`: 01/02/02A/03/04 in-repo fail-closed. 05 y pagos reales NO-GO hasta cuenta sandbox + Sol GO de activación.
- TODO-043 [low] [deferred] Evaluar retiro futuro de los POST de credenciales CUSTOMER/USER específicos por realm. Requiere migrar o conservar explícitamente cada consumidor ejecutable, inventario de instalaciones/clientes soportados, E2E real y aprobación independiente sobre el corte propuesto. Mientras tanto son compatibles, soportados y no deprecados; no bloquea el acceso visual único `/login`.

## Histórico

`store-tenancy-and-profiles` permanece superseded y sólo puede reabrirse como iniciativa SaaS mediante nueva review Sol.
