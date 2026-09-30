# Progreso — convergencia POS sobre integración

- **Estado:** `posc004_merged_posc004a_in_progress`. Head `origin/integration/storecore-int` = `9ff1392` (POSC-004 merge PR #80).
- **Base de POSC-000A:** YAML canónico y recurso servido SHA-256 `7B907A2E11C52A66B7253407FB3F9450CAE7B792BECCF34C1636BE9D3945DE30`.
- **Tareas DAG:** 3/9 done (000/000A/001). TASK-POSC-002 = `slices_complete_residuals`. TASK-POSC-003 = `slices_complete`. TASK-POSC-004 = `merged`. TASK-POSC-004A en implementación.
- **Residuales 002:** runtime `INSERT(variant_id)` sobre `inventory_balances` es false; ML RR / TASK-DSP-000B NO-GO.
- **Siguiente gate:** PR 004A merge. PIC-006A NO-GO hasta ese merge. Sin activación live, sin `sdd.finish`. Verify alojado no es CI verde.
