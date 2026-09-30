# Progreso — convergencia POS sobre integración

- **Estado:** `posc006_merged_posc005_in_progress`. Head `origin/integration/storecore-int` = `dc23b45` (POSC-006 merge PR #82).
- **Base de POSC-000A:** YAML canónico y recurso servido SHA-256 `7B907A2E11C52A66B7253407FB3F9450CAE7B792BECCF34C1636BE9D3945DE30`.
- **Tareas DAG:** 3/9 done (000/000A/001). TASK-POSC-002 = `slices_complete_residuals`. TASK-POSC-003 = `slices_complete`. TASK-POSC-004 = `merged`. TASK-POSC-004A = `merged`. TASK-POSC-006 = `merged`. TASK-POSC-005 = `in_progress`.
- **Residuales 002:** runtime `INSERT(variant_id)` sobre `inventory_balances` es false; ML RR / TASK-DSP-000B NO-GO.
- **Siguiente gate:** dual Grok prv25 + PR 005. Sin activación live, sin `sdd.finish`. Verify alojado no es CI verde.
