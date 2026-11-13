# Backlog — StoreCore

## Bloqueantes

- TODO-001 [critical] [done] Sol GO de `storecore-core-v1.0.0` (`sdd/reviews/20260922-sol-go-core.md`).
- TODO-002 [critical] [done] Flyway/Testcontainers V1–V3 del schema core single-tenant.
- TODO-003 [critical] [done] Fleet inventory, backup/restore y rollback por VM. Runbook: `sdd/features/20260921-single-tenant-installation-baseline/2-technical/fleet-operations.md`.
- TODO-041 [high] [done] Inbox application worker: official refetch port + payment/ML apply + outbox. Unconfigured installations stay RECEIVED. CI uses a fake official resource. No live vendor call and no invented HMAC.

## Features diferidos (no ejecutables en core 1.0.0)

- TODO-047 [high] [done] `storecore-local-commerce-boundary-hardening`: checkout
  sellability/removal, strict cart/receipt wire, role-aligned navigation, local
  presentation integrity and CSRF navigation race closure. PR #235 candidate
  `fd04027`, Verify `42738829321` 3/3 and dual final review APPROVE; no external
  activation, deploy or homologation.

- TODO-048 [high] [done] `storecore-productive-variant-editor`: edición productiva de variantes existentes con nombre, `VariantStatus` cerrado y atributos; identidad/SKU permanecen inmutables y `Unknown` no se persiste. PR #238 candidato `a863a8d`, Verify `42833927010` 3/3 y doble review GPT-6.1 Sol APPROVE. Sin stock, precio, creación/eliminación de variantes, proveedores, deploy ni homologación.

- TODO-049 [medium] [done] `storecore-closed-health-status`: reemplaza el string libre de health por `HealthStatus` cerrado con único traductor wire y `Unknown` fail-closed. PR #239 candidato `35ae0c3`, Verify `42839213825` intento #2 3/3 y doble review GPT-6.1 Sol APPROVE. Sin cambios backend, base, proveedor, deploy ni homologación.

- SCMR [done] `storecore-canonical-state-reconciliation`: estado canónico reconciliado con `master 376790d`, PR #244–#252 y Verify #654–#659. No cambia código ni habilita proveedores, deploy o homologación.

- TODO-044 [high] [done] `commerce-closed-states-and-fulfillment-eligibility`: implementación de PR #171 revalidada sobre PR #231 head `9108798`, merge `eca9db9`; Verify #594 y close-out candidato `4debf9b`/run `42653866473` success. CFE 4 journeys reales + 1 Unknown MockHttp, acceso 12/12, backend 253/253, PostgreSQL 16 y migraciones clean/upgrade PASS. Archivado con doble review final; no acredita CI push master, homologación, release, credenciales live ni activación.
- TODO-045 [high] [done] `commerce-rma-item-disposition-and-restock`: clasificación por ítem, reposición RESTOCK-only, auditoría, idempotencia, recuperación y carreras cerradas en `sdd/features/20261109-commerce-rma-item-disposition-and-restock/`. PR #233 candidato `fc80316`, Verify `42666041072` 3/3; comandos legacy INSPECTED/ADJUSTED permanecen rechazados.
- TODO-046 [high] [done] `storecore-bounded-list-navigation`: paginación completa y accesible del catálogo público/admin e inventario sobre los reads HTTP existentes; contrato absoluto de `truncated`, recuperación acotada, actor binding y foco preservado. PR #234 candidato `4e99400`, Verify `42675235368` 3/3; sin DDL ni proveedores.

- TODO-020 [high] [blocked] `external-fiscal-adapter`: biblioteca/repositorio externo conforme y auditable; D-01..D-07, titular/contador y Sol GO. Sin DDL/tarea fiscal StoreCore y nunca ventas ocultas/evasión.
- TODO-030 [medium] [deferred] `ml-competition-insights`: sólo señales oficiales/licenciadas read-only, fuente/fecha/confianza. Rechaza premisa top-5 y scraping.
- TODO-031 [high] [deferred] `ml-price-automation-management`: APIs oficiales; opt-in por listing, min/max, margen, cooldown, auditoría, kill switch y exclusión mutua con writer local.
- TODO-032 [high] [deferred] `ml-promotion-orchestrator`: candidatos/ofertas/promos oficiales, eligibility/preflight, aprobación humana o preautorización acotada, margen, rollback/reconcile; no promo por scraping.
- TODO-033 [medium] [deferred] `web-cross-sell-discounts`: relación de productos, elegibilidad, descuento, stacking/prioridad/margen, snapshots/reversal. ML virtual kits separado.
- TODO-034 [medium] [deferred] `commercial-calendar`: eventos/campañas definidos por merchant, timezone/preflight/activación/kill switch/rollback; Black Friday configurable, nunca autónomo/hardcodeado.
- TODO-035 [medium] [deferred] ML virtual kits.
- TODO-036 [low] [done] Favorites: PSD-T02 implementó HTTP CUSTOMER, UI productiva y V12; PSD-T08 registra add/remove/reload real local. Evidencia archivada en `sdd/features/20261108-storecore-productive-surface-data-parity/`.
- TODO-037 [medium] [deferred] Loyalty ledger.
- TODO-038 [high] [blocked] `correo-argentino-carrier-discovery`: discovery y
  contrato documentados en
  `sdd/wip/20261111-correo-argentino-carrier-discovery/`. Implementación NO-GO
  hasta seleccionar API/producto, cerrar CA-D01..D10/CA-SC01..SC10, obtener
  credenciales QA por referencia y doble review Sol.
- TODO-039 [high] [superseded] `pos-sales-ingestion`: ISSUE/REVERSAL superseded. Ver TODO-040.
- TODO-040 [high] [blocked] `storecore-pos-integration-contract-v1`: PIC-001..010 + L3 locales done; módulo vuelve a DISABLED. Companion live y activación siguen NO-GO. BlackStore ADP-001..010 + L3 locales done; dual Grok APPROVED; release disabled. No altera las 14 tasks de core 1.0.0.
- TODO-042 [high] [blocked] `storecore-mp-live-checkout-v1`: 01/02/02A/03/04 in-repo fail-closed. 05 y pagos reales NO-GO hasta cuenta sandbox + Sol GO de activación.
- TODO-043 [low] [deferred] Evaluar retiro futuro de los POST de credenciales CUSTOMER/USER específicos por realm. Requiere migrar o conservar explícitamente cada consumidor ejecutable, inventario de instalaciones/clientes soportados, E2E real y aprobación independiente sobre el corte propuesto. Mientras tanto son compatibles, soportados y no deprecados; no bloquea el acceso visual único `/login`.

## Histórico

`store-tenancy-and-profiles` permanece superseded y sólo puede reabrirse como iniciativa SaaS mediante nueva review Sol.
