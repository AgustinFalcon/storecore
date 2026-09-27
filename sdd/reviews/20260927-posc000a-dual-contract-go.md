# POSC-000A — doble review Astra del harness contractual baseline

**Fecha:** 2026-09-27. **Base Git de la rama de trabajo:** `882e42ffb549e28ff8e1d05a44c3cdc55ec23524`. **Objeto revisado:** diff test-only de `backend/pom.xml`, `BlackStoreOpenApiBaselineContractTest.kt`, fixture local `backend/src/test/resources/openapi/blackstore-pin.json` y `.gitattributes`. El hash identifica la base sobre la que se ejecutó el diff, no un commit que ya contenga el harness.

## Veredictos y evidencia

- **Astra A:** GO final para POSC-000A, limitado al parser/fixtures/digest del contrato adjudicado.
- **Astra B:** GO final independiente para el mismo alcance.
- **Verificación local:** `cd backend; mvn -q test` sobre la base y diff revisados: 30 suites, 135 tests, cero failures, cero errors y cero skips. Seis tests pertenecen al harness POSC-000A. El Verify alojado no se contabiliza como verde.

El harness parsea OpenAPI `3.1.0` y exige exactamente siete operaciones de negocio. Compara SHA-256 de los bytes del YAML canónico y el recurso servido con el pin reproducible `7b907a2e11c52a66b7253407fb3f9450cae7b792beccf34c1636be9d3945de30`; cuando el checkout BlackStore está junto a StoreCore compara también su pin vivo. `.gitattributes` fija CRLF para los dos YAML para preservar esos bytes en el checkout Windows. Ni el YAML ni el pin BlackStore se reescribieron.

Los fixtures verifican SKU de 64 caracteres válido y 65 inválido en catálogo, stock, línea, fallo y receipt; respuestas de error con status/`code`, 409 diferenciados por endpoint, 410 `OPERATION_RETIRED`, GET PENDING 200 y ausencia 404, `lineFailures`, ETag/304 y `OperationReceipt` oneOf. Reconcile admite 1..500 receipts en el schema y no declara `uniqueItems`: el harness acepta duplicados como entrada de schema, sin atribuir a ese resultado la deduplicación efectiva del adapter.

## Alcance del GO

POSC-000A pasa a `done` y el WIP queda en 2/9 tareas. Esta evidencia es offline: no prueba endpoint HTTP servido a través de filtros, base PostgreSQL 16, migraciones V1–V7, permisos reales, concurrencia del runtime, worker, purge ni cliente BlackStore. La suite total incluye tests PG16 preexistentes; no se acreditan como entrega de POSC-000A. El PIC-008A histórico con SKU 128/129 y el wire dirty `2AEAC...B7FD` permanecen diferidos. POSC-001 entra a revisión de spec; no tiene GO de implementación, y `BLACKSTORE_INTEGRATION` permanece `DISABLED`.
