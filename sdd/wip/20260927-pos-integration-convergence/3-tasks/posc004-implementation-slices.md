# POSC-004 — subcortes revisables de commit, release y lectura

**Estado:** 003E merge `#79` (`1f81f1f`). Corte 4 deja de estar bloqueado por 003. Un PR a `integration/storecore-int`. Evidencia PG16 local + dual Grok 4.7. No dos Maven a la vez. No frontend deps. No `sdd.finish`. No Flyway nuevo si el contrato ya cabe en V13.

## POSC-004 — commit, release, GET, reconcile

- **Estado:** dual Grok 4.7 prv22 APPROVED (`sdd/reviews/20260930-grok-prv22-sdd.md`, `prv22-scope.md`) @ `11a8a3c`. PR pendiente. P1 no bloqueantes: GET 410 y deadlock 409 no están en el test nuevo (sí en `BlackStoreSagaEngineTest`). No es merge ni CI verde. No desbloquea 004A.
- **Dependencia:** 003E mergeado (`1f81f1f`).
- **Ownership:** un handler por `POST /reservations/{reservationRef}/commit`, `POST …/release`, `GET /operations/{operationId}`, `POST /operations/reconcile`. El engine ya porta Tx-B commit/release y lecturas; este corte prueba y cierra el contrato sobre V13, sin worker.
- **Aceptación:** exactamente un `STOCK_COMMIT_EXTERNAL` por línea y cero `SALE` en canal `EXTERNAL_BLACKSTORE`; replay de commit/release no mueve saldo ni ledger; `reservationRef` de path debe coincidir con la cuádruple; GET PENDING 200, ausente 404, tombstone 410; reconcile 0/501 → 400, 1..500 con duplicados aceptados/deduplicados; deadlock/timeout → 409 `CONFLICT`; bridge `#52` sigue `NOT_ELIGIBLE` (cero `desired_quantity` / `LISTING_STOCK` nuevos). PIC-006A no se acredita (RO proxy Spring queda después de 004A).
- **Fuera:** worker/expiry batch/purge ACL (004A), PIC-006A, ML RR, fiscal, conector live, grant `INSERT(variant_id)`, activación `BLACKSTORE_INTEGRATION` de producción.

## POSC-004A — worker, retry/poison y purge

- **Estado:** NO-GO hasta merge 004.
- **Ownership:** rol/función worker-only, expiry de RESERVED, drain PENDING >60s, purge 90d + tombstone ≥7y, revocación `DELETE` runtime sólo con reemplazo.
- **Aceptación:** documentada en `3-tasks/plan.md` §POSC-004A. No se implementa en el PR 004.
