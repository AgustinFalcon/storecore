# Progreso — convergencia POS sobre integración

- **Estado:** `posc002_slices_complete_residuals_posc003_spec_approved`. Head `origin/integration/storecore-int` = `06a85e2` (POSC-003B merge PR #76).
- **Base de POSC-000A:** YAML canónico y recurso servido SHA-256 `7B907A2E11C52A66B7253407FB3F9450CAE7B792BECCF34C1636BE9D3945DE30`.
- **Tareas DAG:** 3/9 done (000/000A/001). TASK-POSC-002 = `slices_complete_residuals` (no archive). TASK-POSC-003 = `spec_approved` con slices 003A/003B merged y 003C local pending dual review.
- **Residuales 002:** runtime `INSERT(variant_id)` sobre `inventory_balances` es false; ML RR / TASK-DSP-000B NO-GO.
- **Siguiente gate:** PR 003C a integración (prv19 dual APPROVED). 003D–E NO-GO hasta ese merge. Sin activación live, sin `sdd.finish`. Verify alojado no es CI verde.
