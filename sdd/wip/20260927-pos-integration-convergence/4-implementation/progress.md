# Progreso — convergencia POS sobre integración

- **Estado:** `ready_for_baseline_contract_harness`.
- **Base documental:** `origin/integration/storecore-int` `b6f37df5b9f1ef41e2af194f08a457a25fdcc2c5` (2026-09-27); YAML canónico y servido `7B907A2E11C52A66B7253407FB3F9450CAE7B792BECCF34C1636BE9D3945DE30`, igual al pin BlackStore.
- **Tareas:** 1/9 done. `TASK-POSC-000` cerró sólo la decisión documental ADR-001 con doble GO Astra; ver `sdd/reviews/20260927-posc000-dual-adr-go.md`. `TASK-POSC-000A` sigue pending.
- **Siguiente gate:** parser OpenAPI 3.1 y fixtures del baseline integrado, incluidos SKU 64/65 y schema reconcile 1..500 sin `uniqueItems`; cotejo de bytes, copia servida y pin. La deduplicación ejecutada por el adapter se prueba luego en PIC-006A. PIC-008A dirty 128/129 no se acredita.
- **Código:** ningún controller, port, Flyway, permiso, worker, conector ni cliente cambió por POSC-000. Destinos de ruta del ADR son propuesta de porteo; POSC-001..006 siguen gated. `BLACKSTORE_INTEGRATION` permanece `DISABLED`.
