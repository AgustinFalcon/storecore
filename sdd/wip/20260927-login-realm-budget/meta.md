# Login realm budget — delta SDD

- Feature: `20260927-login-realm-budget`.
- Estado: `ready_for_implementation`, 2026-09-27.
- Base: `sdd/features/20260921-single-tenant-installation-baseline/` archivado; no se modifica.
- Gate documental: `sdd/reviews/20260927-login-realm-budget-astra-r2-go.md`.
- Implementación de este corte: rama `fix/storecore-login-realm-budget-int`, basada en `integration/storecore-int` (`ab81789`).

El presupuesto es local al proceso y tiene hasta 10 000 claves activas por realm. USER y CUSTOMER no compiten por cupos. La saturación deniega claves nuevas, aun con credenciales correctas. Su `Retry-After` describe la liberación real de una plaza y difiere del bloqueo de cinco fallos por clave.

## Gate

La revisión documental Astra r2 dio GO para implementar TASK-LRB-002/003. TASK-LRB-001/002/003 están `done`: la suite local completa pasó con 29 suites y 126 tests. Dos agentes Astra revisaron independientemente el diff de código contra `ab81789` y dieron GO para preparar el PR hacia integración; sus observaciones P3 están registradas en `sdd/reviews/20260927-login-realm-budget-astra-code-dual-go.md`. TASK-LRB-004 sigue `pending` hasta el cierre del PR con su diff final y evidencia correspondiente. TASK-LRB-005 mantiene los SHOULD separados. CI remoto no está verificado; este WIP no aprueba merge, release ni `/sdd.finish`.
