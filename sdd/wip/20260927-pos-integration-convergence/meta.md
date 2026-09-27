# Meta — convergencia del contrato POS sobre integración

- **Feature id:** `20260927-pos-integration-convergence`
- **Feature UUID:** `ef497bb4-6121-4c83-928b-61067485dca0`
- **Status:** `ready_for_contract_adjudication` (GO documental dual Astra sólo para preparar POSC-000/000A; no aprobación global)
- **Mode / stack:** standard / backend Kotlin-Spring Boot, PostgreSQL 16, Flyway
- **Snapshot de redacción/review:** `origin/integration/storecore-int` en `56baa2db2d6fabbd683ce41459414c556cb5246d` (2026-09-27). **HEAD actual del worktree documental:** `c0650ec699ba3f582e4cbd8e1013bef7de7df608`, ya actualizado sobre integración; revalidar de nuevo antes de POSC-000A o migraciones.
- **Fuente de comparación, sólo lectura:** `fix/storecore-pos-contract-readiness` en `0f2b21a`, con 32 archivos tracked modificados y 97 untracked al inventariar. No es una rama integrable en bloque.
- **Contrato funcional de referencia:** `sdd/wip/20260921-storecore-pos-integration-contract-v1/` y su único OpenAPI versionado `1.0.0-draft`; el companion vivo se especifica en BlackStore `blackstore-pilot`. La copia de integración y la copia dirty readiness son divergentes y no se pueden llamar equivalentes.

## Alcance

Planificar la incorporación segura de la evidencia POS local a la historia Flyway y al backend de integración que ya contiene PIC-001..010/L3 locales. Este WIP no sustituye el contrato canónico, no aprueba el adapter live y no declara terminadas tareas de código. Las revisiones del 24 de septiembre y los conteos locales 288/48 son evidencia histórica de otra base: deben repetirse contra la base actual. Se propone conservar el YAML integrado/pinneado y diferir la copia dirty; POSC-000A valida ese baseline por parser/fixtures/digest antes del harness PG16 o del porteo. El PIC-008A histórico, cuyo fixture SKU 128/129 pertenece a la propuesta dirty, sigue pendiente y no se acredita por validar 64/65. Ver `2-technical/adr/ADR-001-contract-adjudication.md`.

## Estado de fases

| Fase | Estado |
|---|---|
| 1 — Functional Spec | `ready_for_contract_adjudication` |
| 2 — Technical Spec | `ready_for_contract_adjudication` |
| 3 — Tasks | `ready_for_contract_adjudication` |
| 4 — Implementation | `blocked_by_contract_gate` |

## Gates

Dos revisores Astra dieron GO documental acotado, registrado en `sdd/reviews/20260927-pos-convergence-dual-documentary-go.md`: se pueden preparar POSC-000 y POSC-000A, ambos aún pendientes. Antes de cualquier código de porteo siguen faltando ADR contractual adjudicado, fixtures/digest, decisión del adapter canónico y GO del corte siguiente. POSC-000A valida baseline OpenAPI 3.1/fixtures/digest sin cerrar PIC-008A histórico; POSC-006 valida GET/reconcile read-only PG16 por proxy Spring después de POSC-004A, con duplicados aceptados/deduplicados según baseline y rechazo 400 histórico diferido. El harness PG16 general es otro corte. `BLACKSTORE_INTEGRATION` permanece `DISABLED`; no hay acceso cruzado a bases, conector live, fiscal ni `sdd.finish` por este WIP.
