# Meta — convergencia del contrato POS sobre integración

- **Feature id:** `20260927-pos-integration-convergence`
- **Feature UUID:** `ef497bb4-6121-4c83-928b-61067485dca0`
- **Status:** `slices_complete_residuals` (POSC-000/000A/001 done; 002A–G y 003A–E integrados; 004/004A/005/006 mergeados sólo a integración; residuales y live siguen abiertos)
- **Mode / stack:** standard / backend Kotlin-Spring Boot, PostgreSQL 16, Flyway
- **Snapshots históricos de diseño:** `56baa2d`, `73367fa`, `b6f37df`, `882e42f`, `d8dc971` y `9ce355b` documentan los gates sucesivos; `ab81789` es un snapshot ML anterior. **Base actual de esta reconciliación:** `origin/integration/storecore-int` en `a8874ad` (2026-10-01), Flyway hasta V19. Revalidar head antes de cualquier delta nuevo.
- **Fuente de comparación, sólo lectura:** `fix/storecore-pos-contract-readiness` en `0f2b21a`, con 32 archivos tracked modificados y 97 untracked al inventariar. No es una rama integrable en bloque.
- **Contrato funcional de referencia:** `sdd/wip/20260921-storecore-pos-integration-contract-v1/` y su único OpenAPI versionado `1.0.0-draft`; el companion vivo se especifica en BlackStore `blackstore-pilot`. La copia de integración y la copia dirty readiness son divergentes y no se pueden llamar equivalentes.

## Alcance

Planificar la incorporación segura de la evidencia POS local a la historia Flyway y al backend de integración que ya contiene PIC-001..010/L3 locales. Este WIP no sustituye el contrato canónico ni aprueba el adapter live. Las revisiones del 24 de septiembre y los conteos locales 288/48 son evidencia histórica de otra base. ADR-001 adjudicó conservar el YAML integrado/pinneado y diferir la copia dirty; POSC-000A validó ese baseline por parser, fixtures y digest sin PostgreSQL ni HTTP. El PIC-008A histórico, cuyo fixture SKU 128/129 pertenece a la propuesta dirty, sigue pendiente y no se acredita por validar 64/65. Ver `2-technical/adr/ADR-001-contract-adjudication.md` y `sdd/reviews/20260927-posc000a-dual-contract-go.md`.

## Estado de fases

| Fase | Estado |
|---|---|
| 1 — Functional Spec | `posc002_astra_go_pos_scope` |
| 2 — Technical Spec | `posc002_astra_go_pos_scope` |
| 3 — Tasks | `slices_complete_residuals` |
| 4 — Implementation | `offline_slices_merged_live_no_go` |

## Gates

Dos revisores Astra dieron GO documental a POSC-000/000A y al harness test-only POSC-001; ese harness pasó 32 suites/142 tests locales y obtuvo dos GO de código (`sdd/reviews/20260927-posc001-dual-code-go.md`). Después se integraron 002A–G y 003A–E, y se mergearon 004/004A/005/006 con sus reviews por corte. PIC-006A quedó certificado por TASK-POSC-006 / PR #82 (`dc23b45`) sobre el baseline; la variante dirty continúa diferida. PIC-008A SKU 128/129, runtime `INSERT(variant_id)=false`, activación y operación live conservan gates. `BLACKSTORE_INTEGRATION` permanece `DISABLED`; no hay conector live, fiscal ni `sdd.finish`.

La propuesta POSC-002 delimitó bearer opaco, principal y scopes, barrera revoke/rotate/Tx-A→Tx-B, ACL/funciones V3 y coordinación de versión con ML-DSP-000B. Sus slices tienen evidencia integrada por PR, pero eso no habilita credenciales, companion live, `master`, release ni cierre del WIP. Los residuales siguen enumerados en `3-tasks/tasks.json`.
