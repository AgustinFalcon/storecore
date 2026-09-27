# POSC-001 — doble review Astra del harness PG16 test-only

**Fecha:** 2026-09-27. **Base Git del diff:** `01a5bea779b0be498ea678af21db343edc821e94`. **Alcance revisado:** tres archivos de test: `BlackStoreRouteTopologyHarnessTest.kt`, `BlackStorePg16UpgradeAclHarnessTest.kt` y `BlackStoreSagaEngineTest.kt`. El SHA identifica la base del diff local, no un commit que ya contenga el harness.

## Evidencia ejecutada

`cd backend; mvn -q test` sobre la base y el diff final: **32 suites, 142 tests, 0 failures, 0 errors y 0 skips**. Testcontainers usa PostgreSQL 16. El harness inventaría en Spring siete rutas de negocio más `GET /openapi.yaml` con owner único; el verificador detecta duplicado y ausencia sintéticos.

Dos bases PG16 independientes con schema `public` prueban instalación limpia y upgrade escalonado V1→V2→V4→V5→V6→V7. Se compara historia Flyway por `version/script/checksum/success` y catálogo estructural normalizado sin OIDs ni metadatos variables. Las fixtures conservan snapshots por etapa de catálogo/inventario WEB, USER/CUSTOMER Argon2id, claim/orden/items/pago, companion/credencial sintética y saga PENDING/RESERVED/COMMITTED/tombstone con vínculos reales a reservas y ledger. El negativo bcrypt en una tercera base detiene V2 por precheck sin perder V1 ni usar `repair`. La capability y el companion permanecen `DISABLED`.

ACL baseline se mide con login no propietario miembro de `storecore_runtime`, `current_user`, grants y negativas SQLSTATE `42501`. El resultado registra DML amplio V5/V6, `PUBLIC EXECUTE` de cuatro funciones `SECURITY DEFINER` y ausencia de rol DB worker dedicado: son gaps observados, no aprobación de privilegio mínimo. Concurrencia consume todos los `Future` con timeout, whitelist de errores de negocio y cierre del executor; comprueba cantidades exactas de receipt, reserva, ledger y balance, tombstone y fallas asíncronas inesperadas.

## Hallazgos P2 de la primera review y fixes

1. **Replay de commit condicionado por la carrera:** el test sólo lo ejecutaba si `COMMITTED` ganaba frente a expire; cuando ganaba `EXPIRED`, faltaba evidencia de idempotencia del commit. Se añadió un escenario determinista reserve→commit→replay que compara receipt/ref y filas completas de ledger, balance, saga y reserva, con cero decrementos adicionales.
2. **Upgrade con comprobaciones débiles y fixtures inconsistentes:** contadores/subsets no probaban preservación; el ledger WEB de reserva tenía signo `+2`, y las sagas POS RESERVED/COMMITTED quedaban huérfanas de su inventario/ledger. El fix usa `-2` para la reserva WEB, snapshots de filas por etapa V1/V2/V4/V5/V6, checkpoint de inventario V1 tras V6 y antes de actividad externa, y vínculos reales saga→línea→reserva→ledger, incluidos los terminales.

La observación P3 sobre identidad ACL y estructura de columnas también quedó cubierta: se verifica `current_user` bajo un login no dueño y el catálogo normalizado incluye longitud, precisión y escala. Tras esos fixes, **Astra A y Astra B dieron GO final de código** para POSC-001, sin P2 abierto en este corte.

## Límite del GO

`TASK-POSC-001` pasa a `done`; convergencia queda en **3/9**. Esta es evidencia local test-only; no hay CI remoto verde reclamado ni se declara `sdd.finish`. No se modificaron código productivo, V1–V7, ACL, worker, OpenAPI o cliente BlackStore; tampoco se aprobó una migración nueva. POSC-002 requiere review de spec y GO propios antes de código o DDL. El harness no acredita PIC-008A, PIC-006A, POSC-004A ni conector live; `BLACKSTORE_INTEGRATION` sigue `DISABLED`.
