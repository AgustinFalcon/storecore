# Meta — convergencia del contrato POS sobre integración

- **Feature id:** `20260927-pos-integration-convergence`
- **Feature UUID:** `ef497bb4-6121-4c83-928b-61067485dca0`
- **Status:** `ready_for_baseline_contract_harness` (POSC-000 documental done con doble GO Astra; POSC-000A pendiente; sin aprobación de porteo)
- **Mode / stack:** standard / backend Kotlin-Spring Boot, PostgreSQL 16, Flyway
- **Snapshot de redacción inicial:** `origin/integration/storecore-int` en `56baa2db2d6fabbd683ce41459414c556cb5246d`. **Head de adjudicación:** `73367fa8711ac1d2e95397ec25c98eb9e20d7ad9`; worktree documental rebasado sobre `b6f37df5b9f1ef41e2af194f08a457a25fdcc2c5` (2026-09-27). El delta hasta `b6f37df` no cambió YAML POS, Flyway ni este WIP; revalidar head antes de POSC-000A o migraciones.
- **Fuente de comparación, sólo lectura:** `fix/storecore-pos-contract-readiness` en `0f2b21a`, con 32 archivos tracked modificados y 97 untracked al inventariar. No es una rama integrable en bloque.
- **Contrato funcional de referencia:** `sdd/wip/20260921-storecore-pos-integration-contract-v1/` y su único OpenAPI versionado `1.0.0-draft`; el companion vivo se especifica en BlackStore `blackstore-pilot`. La copia de integración y la copia dirty readiness son divergentes y no se pueden llamar equivalentes.

## Alcance

Planificar la incorporación segura de la evidencia POS local a la historia Flyway y al backend de integración que ya contiene PIC-001..010/L3 locales. Este WIP no sustituye el contrato canónico, no aprueba el adapter live y no declara terminadas tareas de código. Las revisiones del 24 de septiembre y los conteos locales 288/48 son evidencia histórica de otra base: deben repetirse contra la base actual. ADR-001 adjudicó conservar el YAML integrado/pinneado y diferir la copia dirty; POSC-000A valida ese baseline por parser/fixtures/digest antes del harness PG16 o del porteo. El PIC-008A histórico, cuyo fixture SKU 128/129 pertenece a la propuesta dirty, sigue pendiente y no se acredita por validar 64/65. Ver `2-technical/adr/ADR-001-contract-adjudication.md` y `sdd/reviews/20260927-posc000-dual-adr-go.md`.

## Estado de fases

| Fase | Estado |
|---|---|
| 1 — Functional Spec | `ready_for_baseline_contract_harness` |
| 2 — Technical Spec | `ready_for_baseline_contract_harness` |
| 3 — Tasks | `ready_for_baseline_contract_harness` |
| 4 — Implementation | `blocked_by_contract_gate` |

## Gates

Dos revisores Astra dieron GO documental acotado para preparar POSC-000/000A (`sdd/reviews/20260927-pos-convergence-dual-documentary-go.md`). Luego ambos dieron GO final al ADR corregido (`sdd/reviews/20260927-posc000-dual-adr-go.md`): POSC-000 está done (1/9); POSC-000A sigue pending. Antes de cualquier código de porteo faltan parser/fixtures/digest sobre el baseline elegido, evidencia PG16 y GO del corte siguiente. Los controllers especializados son destinos propuestos, no owners activos; la autenticación compatible, el backfill de owner, receipts históricos y el filtro OpenAPI conservan gates explícitos. POSC-000A no cierra PIC-008A histórico; POSC-006 valida GET/reconcile read-only PG16 por proxy Spring después de POSC-004A. `BLACKSTORE_INTEGRATION` permanece `DISABLED`; no hay conector live, fiscal ni `sdd.finish` por este WIP.
