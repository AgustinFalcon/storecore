VERDICT: CHANGES_REQUIRED

# Sol documentary re-review — StoreCore POS integration contract v1

**Fecha:** 2026-09-23  
**Baseline revisado:** `master` @ `90849b6` (PR #17 merged)  
**Alcance:** contrato documental exclusivamente. No es un implementation GO.

## Dictamen

La reconciliación cerró los cambios requeridos anteriores sobre ADR-007 y ADR-008: `retention_until` y la retención mínima de siete años, la secuencia única de purge, el orden de locks y tombstones, `OPERATION_STATE_CONFLICT`, `AC-STK-8`, schema v2, `action_kind`, `allowed_when_paused`, ownership V4/V5/V6 y la separación de `TASK-PIC-007`/`TASK-PIC-010` están propagados de forma coherente en specs, data model y tasks. El OpenAPI conserva `1.0.0-draft` y su `x-approval-gate` niega correctamente todo código hasta un GO separado.

Queda una inconsistencia normativa en el OpenAPI canónico:

- ADR-007, AC-STK-3/4/8 y el spec técnico exigen que reserve, commit y release consulten el tombstone y respondan **410 `OPERATION_RETIRED`** cuando exista.
- Las descripciones de `ConflictReserve` y `ConflictCommitRelease` también declaran que el mismo POST responde 410 después del purge.
- Sin embargo, ninguno de los tres POST declara una respuesta `'410': { $ref: '#/components/responses/OperationRetired' }` en su mapa de `responses`. Actualmente sólo GET operation expone esa respuesta, por lo que un consumidor generado desde el contrato no puede reconocer normativamente el resultado exigido para las rutas mutantes.

## Corrección documental requerida

Agregar `OperationRetired` como respuesta 410 de:

1. `POST /blackstore-integration/v1/reservations`
2. `POST /blackstore-integration/v1/reservations/{reservationRef}/commit`
3. `POST /blackstore-integration/v1/reservations/{reservationRef}/release`

Después, revalidar que las rutas mutantes, ADR-007, las matrices funcional/técnica y tasks expresen la misma semántica tombstone → 410 `OPERATION_RETIRED`, `retryable=false`, nunca re-POST.

## Gate

**Implementation GO: NO.** El WIP permanece `ready_for_sol_review` con `implementation: blocked_by_sol_gate`. Este dictamen no contiene `CONDITIONAL_GO` y no autoriza código, DDL, Flyway, endpoints, ports, DTOs, fixtures runtime, adapters, workers, secretos, activación, deploy, tag ni publish. Sólo se permite la corrección documental indicada y su nueva revisión.
