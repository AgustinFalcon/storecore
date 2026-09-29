# Meta — convergencia del contrato POS sobre integración

- **Feature id:** `20260927-pos-integration-convergence`
- **Feature UUID:** `ef497bb4-6121-4c83-928b-61067485dca0`
- **Status:** `ready_for_posc002_implementation_plan_review` (POSC-000/000A/001 done; GO documental Astra POSC-002 acotado al camino POS, subcortes por revisar; sin código ni DDL aplicados)
- **Mode / stack:** standard / backend Kotlin-Spring Boot, PostgreSQL 16, Flyway
- **Snapshot de redacción inicial:** `origin/integration/storecore-int` en `56baa2db2d6fabbd683ce41459414c556cb5246d`. **Head de adjudicación:** `73367fa8711ac1d2e95397ec25c98eb9e20d7ad9`; snapshot revisado sobre `b6f37df5b9f1ef41e2af194f08a457a25fdcc2c5` (2026-09-27). **Base POSC-000A:** `882e42ffb549e28ff8e1d05a44c3cdc55ec23524`. **Base POSC-002 revisada:** `d8dc971`; `origin/integration/storecore-int` verificado en `9ce355b` con V1–V7. `ab81789` es snapshot ML anterior. Revalidar head antes de migraciones.
- **Fuente de comparación, sólo lectura:** `fix/storecore-pos-contract-readiness` en `0f2b21a`, con 32 archivos tracked modificados y 97 untracked al inventariar. No es una rama integrable en bloque.
- **Contrato funcional de referencia:** `sdd/wip/20260921-storecore-pos-integration-contract-v1/` y su único OpenAPI versionado `1.0.0-draft`; el companion vivo se especifica en BlackStore `blackstore-pilot`. La copia de integración y la copia dirty readiness son divergentes y no se pueden llamar equivalentes.

## Alcance

Planificar la incorporación segura de la evidencia POS local a la historia Flyway y al backend de integración que ya contiene PIC-001..010/L3 locales. Este WIP no sustituye el contrato canónico ni aprueba el adapter live. Las revisiones del 24 de septiembre y los conteos locales 288/48 son evidencia histórica de otra base. ADR-001 adjudicó conservar el YAML integrado/pinneado y diferir la copia dirty; POSC-000A validó ese baseline por parser, fixtures y digest sin PostgreSQL ni HTTP. El PIC-008A histórico, cuyo fixture SKU 128/129 pertenece a la propuesta dirty, sigue pendiente y no se acredita por validar 64/65. Ver `2-technical/adr/ADR-001-contract-adjudication.md` y `sdd/reviews/20260927-posc000a-dual-contract-go.md`.

## Estado de fases

| Fase | Estado |
|---|---|
| 1 — Functional Spec | `posc002_astra_go_pos_scope` |
| 2 — Technical Spec | `posc002_astra_go_pos_scope` |
| 3 — Tasks | `posc002_implementation_plan_review` |
| 4 — Implementation | `posc001_test_only_done_posc002_not_started` |

## Gates

Dos revisores Astra dieron GO documental a POSC-000/000A y a la propuesta test-only de POSC-001. El harness PG16 pasó 32 suites/142 tests locales y obtuvo dos GO Astra de código (`sdd/reviews/20260927-posc001-dual-code-go.md`): 3/9 tareas done. Un dictamen Astra posterior dio GO documental a POSC-002 acotado al camino POS (`sdd/reviews/20260928-posc002-shared-pos-spec-go.md`). Sus subcortes 002A–G requieren review del plan, pruebas y dos reviews de código por PR. La migración de permisos/SECURITY DEFINER fue autorizada por el usuario el 2026-09-28, pero aún no existe. El delta shared V3 tiene owner/Flyway únicos; ML REPEATABLE READ y TASK-DSP-000B conservan review y carrera admin-wins propias. Los controllers especializados son destinos propuestos, no owners activos; autenticación, backfill de owner, receipts y filtro OpenAPI conservan gates. POSC-001 no cierra PIC-008A ni PIC-006A; POSC-006 valida GET/reconcile RO después de POSC-004A. `BLACKSTORE_INTEGRATION` permanece `DISABLED`; no hay conector live, fiscal ni `sdd.finish`.

La propuesta POSC-002 delimita bearer opaco, principal y scopes, barrera revoke/rotate/Tx-A→Tx-B, ACL/funciones V3 y coordinación de versión con ML-DSP-000B. Su GO documental y la autorización del usuario no son evidencia de migración aplicada, tests ni código aprobado. El plan de implementación y cada PR mantienen gates propios.
