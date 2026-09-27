# Login realm budget — GO documental Astra r2

**Fecha:** 2026-09-27 · **Alcance:** delta SDD `20260927-login-realm-budget` · **Resultado:** GO para implementar `TASK-LRB-002` y `TASK-LRB-003`.

La segunda revisión Astra validó la distinción de los dos cálculos de `Retry-After`: para `n >= 5` fallos vigentes de una clave, el índice `n - 5`; para saturación del realm, el menor vencimiento basado en el **último** fallo de cada bucket activo. El contrato y las pruebas exigidas cubren intercalación de intentos, bordes de la ventana, redondeo, recuperación y aislamiento de cupos USER/CUSTOMER.

Este dictamen cierra el gate documental `TASK-LRB-001`. Los SHOULD de contención y memoria por bucket permanecen en `TASK-LRB-005`. El GO no aprueba la implementación existente o futura, no sustituye las dos revisiones independientes de código, ni acredita CI remoto o autorización para merge/release.
