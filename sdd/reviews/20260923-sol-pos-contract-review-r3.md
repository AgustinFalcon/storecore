VERDICT: APPROVED

# Sol documentary review r3 — StoreCore POS integration contract v1

**Fecha:** 2026-09-23
**PR:** #18 (`docs/pos-openapi-410` → `master`)
**Baseline:** `master` @ `90849b6`
**Alcance:** contrato documental exclusivamente.

## Dictamen

La corrección requerida por r2 quedó aplicada de forma coherente:

- `POST /blackstore-integration/v1/reservations` declara 410 `OperationRetired`.
- `POST /blackstore-integration/v1/reservations/{reservationRef}/commit` declara 410 `OperationRetired`.
- `POST /blackstore-integration/v1/reservations/{reservationRef}/release` declara 410 `OperationRetired`.
- La respuesta reutilizada fija `code=410`, `errorCode=OPERATION_RETIRED` y `retryable=false`.
- `TASK-PIC-004`, `TASK-PIC-005` y `TASK-PIC-008` incorporan explícitamente el resultado tombstone de los POST.

El OpenAPI mutante, AC-STK-3/4/7/8, el spec técnico, ADR-007 y las tasks expresan ahora la misma regla: bajo el advisory lock se consulta primero el tombstone; una saga retirada responde 410 y nunca se re-POSTea. No queda pendiente el `CHANGES_REQUIRED` de r2.

## Gate

**Implementation GO: NO.** Esta aprobación es sólo documental. No contiene `CONDITIONAL_GO` y no autoriza código, DDL, Flyway, endpoints, ports, DTOs, fixtures runtime, adapters, workers, secretos, activación, deploy, tag ni publish. El WIP conserva `ready_for_sol_review` y `implementation: blocked_by_sol_gate` hasta un GO separado y explícito.
