VERDICT: CHANGES_REQUIRED

# Sol documentary gate — StoreCore POS integration contract v1

**Fecha:** 2026-09-23  
**WIP:** `sdd/wip/20260921-storecore-pos-integration-contract-v1/`  
**Alcance de este dictamen:** revisión exclusivamente documental. No es un implementation GO.

## Dictamen

- **Contrato documental:** no aprobado todavía. La intención de aislamiento del companion, single-tenant por instalación, autoridad de stock en StoreCore, saga idempotente y exclusión fiscal es compatible con el baseline; sin embargo, ADR-007 y ADR-008 agregan decisiones normativas que no fueron propagadas de forma coherente al spec funcional/técnico, data model, OpenAPI y tasks.
- **Implementación:** **sigue bloqueada**. Este archivo no contiene `CONDITIONAL_GO` ni autoriza a Luna. Cualquier implementación futura exige un dictamen Sol separado y explícito después de corregir y volver a revisar el corpus documental.
- **Estado requerido:** conservar `ready_for_sol_review` / `implementation: blocked_by_sol_gate`; no promover a approved, implementable, completed ni archived.

## Cambios documentales requeridos

1. **Propagar ADR-007 anti-resurrection.**
   - Agregar al data model el `retention_until` requerido por ADR-007 y su garantía mínima de siete años.
   - Describir de forma única el purge transaccional: lock común, INSERT tombstone, DELETE de líneas y DELETE de saga. El texto actual omite el borrado de líneas aunque `ON DELETE RESTRICT` impide borrar la saga.
   - Propagar el advisory transaction lock y las consultas de tombstone de reserve/commit/release a spec funcional, spec técnico, tasks y criterios de prueba.
   - Resolver `OPERATION_STATE_CONFLICT`: incorporarlo coherentemente en OpenAPI, matrices de error y tasks, o retirarlo formalmente de ADR-007. Hoy sólo existe en ese ADR.
   - Definir `AC-STK-8` en el spec funcional antes de referenciarlo desde tasks.

2. **Propagar ADR-008 de compatibilidad V3.**
   - Reescribir el delta documental para incluir `action_kind`, `allowed_when_paused`, schema v2 tipado y el ownership migratorio V4/V5/V6.
   - Alinear tasks y dependencias con ese ownership. El `TASK-PIC-007` actual trata error wire/rate limiting, pero ADR-008 también usa `PIC-007` para la promoción migratoria; esa colisión debe desaparecer.
   - Documentar el flujo CAS/audit que conserva config v2 y la promoción limitada de `future_optional`, sin sugerir que el SQL actualmente mostrado es aplicable.

3. **Cerrar la contradicción del gate.**
   - Cambiar `x-approval-gate.consequence` del OpenAPI: antes de un GO separado no se autorizan ports, DTOs, fixtures ni ningún otro código. Sólo puede modificarse documentación.
   - Mantener consistentes `meta.md`, specs, OpenAPI y tasks con el NO-GO vigente de `sdd/STATUS.md` y `sdd/reviews/20260922-sol-remaining-plan-go.md`.

4. **Revalidar el corpus documental completo.**
   - Verificar una sola matriz de estados/errores y una sola secuencia de purge.
   - Verificar trazabilidad ADR → AC → OpenAPI/data model → task, sin IDs huérfanos ni decisiones que existan en un único archivo.
   - Mantener el YAML como `1.0.0-draft`; la corrección documental no lo publica ni lo sirve como endpoint.

## Permitido ahora — docs only

Terra puede editar únicamente el WIP, ADRs, OpenAPI como artefacto contractual no servido, data-model como diseño no aplicado, tasks, relaciones/trazabilidad y documentos de review/estado para resolver los puntos anteriores. Luna puede colaborar sólo en correcciones documentales si Terra/Sol lo solicita; no puede convertirlas en archivos runtime, migraciones o pruebas de implementación.

## Prohibido

Hasta un `CONDITIONAL_GO` de implementación separado quedan prohibidos:

- cualquier código de `BLACKSTORE_INTEGRATION`, incluidos ports, DTOs, fixtures runtime, adapters o clientes;
- Flyway, DDL aplicado o cambios de schema;
- endpoints `/blackstore-integration/v1`;
- workers de expiry, cleanup o purge;
- acceso cross-DB, DSN o JDBC entre StoreCore y BlackStore;
- ISSUE/REVERSAL, `channel=POS`, `EXTERNAL`, oversell o resurrección de WIP superseded;
- `store_id`, shared runtime, tenant routing o cualquier selector multi-tenant;
- activar la capability, secretos, deploy, tag o publish.

## Condición para nueva revisión

Terra debe presentar el corpus documental reconciliado. Sol podrá entonces aprobar o rechazar el contrato documental. Incluso una futura aprobación documental **no** autoriza implementación salvo que el mismo o un posterior dictamen incluya de forma inequívoca un `CONDITIONAL_GO` separado con alcance y gates ejecutables.
