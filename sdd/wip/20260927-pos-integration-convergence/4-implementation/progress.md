# Progreso — convergencia POS sobre integración

- **Estado:** `posc002_slices_complete_residuals_posc003_spec_approved`. Head `origin/integration/storecore-int` = `21780e4` (POSC-003C merge PR #77).
- **Base de POSC-000A:** YAML canónico y recurso servido SHA-256 `7B907A2E11C52A66B7253407FB3F9450CAE7B792BECCF34C1636BE9D3945DE30`.
- **Tareas DAG:** 3/9 done (000/000A/001). TASK-POSC-002 = `slices_complete_residuals`. TASK-POSC-003 slices 003A–C merged; 003D local pending dual review.
- **Residuales 002:** runtime `INSERT(variant_id)` sobre `inventory_balances` es false; ML RR / TASK-DSP-000B NO-GO.
- **Siguiente gate:** PR 003D a integración (prv20 dual APPROVED). 003E NO-GO hasta ese merge. Sin activación live, sin `sdd.finish`. Verify alojado no es CI verde.
