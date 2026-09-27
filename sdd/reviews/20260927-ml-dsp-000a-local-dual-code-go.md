# TASK-DSP-000A — código local y dos reviews Astra

**Fecha:** 2026-09-27
**Base:** `integration/storecore-int` `ab817891abb6c7b710bca809804d924401ed74f0`
**Worktree de implementación:** `C:\Users\agustin\Desktop\StoreCore-int-ml-pic009-seal`, rama `codex/task-dsp-000a-pic009-seal`
**Estado:** corte implementado y revisado localmente; sin commit, PR, merge ni CI alojado verificado al registrar este documento.

Luna retiró `JdbcBlackStoreMlListingAdapter` y su port de escritura directa. El bridge de aplicación actual no tiene dependencias de persistencia/red y siempre devuelve `NOT_ELIGIBLE`. Commit/release conservan la saga y llaman al bridge inerte después de la transacción; la futura delegación canónica deberá moverse a la misma transacción, no reutilizar ese `.also` post-commit.

La prueba con `BLACKSTORE_INTEGRATION=ACTIVE` comprueba cero actualización de `desired_quantity`, cero `LISTING_STOCK` nuevo y preservación del payload histórico sembrado. Fuera de ese fixture, la capability sigue `DISABLED`. La búsqueda de código productivo no encontró writer directo restante.

Verificación local: `mvn -q "-Dtest=BlackStoreHttpContractTest,BlackStoreFailClosedHttpTest,BlackStoreSagaEngineTest" test`: 3 suites, 15 tests, 0 fallos/errores/skips; PG16/Testcontainers iniciado. `git diff --check` pasa (sólo avisos CRLF habituales).

Dos revisores Astra independientes inspeccionaron el diff completo contra la base, incluidos archivos nuevos y eliminados, SDD y Surefire. Ambos dictaminaron **APPROVED**, sin P0/P1/P2. Sugirieron P3 opcional: probar también release y replay de commit con el bean real y comparar un snapshot histórico más completo. No se atribuye a esos dictámenes aprobación de un PR futuro cuyo diff cambie.

No hay GO de PIC-005, proyector, conector BlackStore, despliegue ni release. TASK-DSP-000B y el resto del DAG continúan pendientes; R01/R02 y empaquetado/PR se harán sobre el diff final.
