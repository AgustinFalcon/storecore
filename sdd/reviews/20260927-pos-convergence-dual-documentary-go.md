# Convergencia POS — doble review documental Astra

**Fecha:** 2026-09-27

**Objeto:** `sdd/wip/20260927-pos-integration-convergence/` en el worktree `docs/pos-convergence-sdd`. El snapshot revisado se redactó sobre `origin/integration/storecore-int` `56baa2db2d6fabbd683ce41459414c556cb5246d`; el worktree documental está ahora en `c0650ec699ba3f582e4cbd8e1013bef7de7df608`.

**Revisores:** Astra A y Astra B, independientes; dictámenes comunicados al integrador de este trabajo.

**Veredictos:** A **GO documental acotado**; B **GO documental acotado**. Sin P0–P3 abiertos en el pase final.

## Alcance del GO

Se pueden preparar `TASK-POSC-000` (matriz/decisión contractual y adapter owner propuesto) y `TASK-POSC-000A` (parser OpenAPI 3.1, fixtures y SHA-256 del **baseline integrado**). Ambos permanecen `pending`: este review no ejecutó ADR ni fixtures ni aprobó la elección contractual. El estado del WIP es `ready_for_contract_adjudication`, no `approved` ni `sdd.finish`.

Los revisores aceptaron que el baseline integrado y su copia servida comparten SHA-256 `7B907A2E11C52A66B7253407FB3F9450CAE7B792BECCF34C1636BE9D3945DE30`, igual al pin BlackStore. La copia dirty readiness `2AEACCD5E1AA3990CF514DAC5C241DBF6E9420999426C89768FCEF05FDFCB7FD` (+108/-43 líneas) es una propuesta diferente pese a declarar también `1.0.0-draft`. `ADR-001` propone conservar el baseline y diferir cambios individuales, sujeto a adjudicación. POSC-000A no cierra PIC-008A histórico: baseline SKU 64/65 y propuesta dirty 128/129 tienen fixtures distintos.

La revisión final comprobó que el plan separa el harness PG16 general, el contrato parser/digest y PIC-006A GET/reconcile read-only por proxy Spring real con `REPEATABLE_READ`. En el baseline `knownReceipts` admite 1..500 sin `uniqueItems` y el adapter deduplica; el rechazo 400 de duplicados queda diferido al contrato dirty. `TASK-POSC-006` depende de `TASK-POSC-004A` para fotografiar retry/alert; `TASK-POSC-005` depende de ambos. Purge, worker, ACL, carreras WEB/PIC y bridge ML `NOT_ELIGIBLE` figuran como gates expresos.

## Fuera del dictamen

No hay GO para POSC-001..006, porteo productivo, migraciones Flyway, cambio de YAML servido, nuevo digest/pin BlackStore, conector live, secrets, activación, PR/merge, CI remoto, release ni cierre SDD. El checkout POS readiness divergente sigue intacto. Los tests locales 288/48 del 24-Sep son históricos y no sustituyen evidencia del head actual.

El snapshot de la review nació en `56baa2d`; la rama documental fue actualizada a `c0650ec` después. Los PR #53/#54/#55 intermedios tocaron sólo documentación ML/login y `sdd/STATUS.md`; no cambiaron YAML POS ni Flyway en el diff observado. Antes de ejecutar POSC-000A o diseñar migraciones, revalidar head, digests y objetos reales. Este registro no afirma que las tareas pendientes se hayan ejecutado.
