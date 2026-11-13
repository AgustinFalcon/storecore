# Plan

| ID | Tarea | Estado |
| --- | --- | --- |
| CAC-001 | Revisar specs con dominio/concurrencia y UX/seguridad. | Done — GO v3 coordinado |
| CAC-002 | Implementar retorno cerrado checkout/direcciones. | Done |
| CAC-003 | Aislar carga/error de direcciones del carrito. | Done |
| CAC-003A | Separar ciclo de lectura de carrito del intento de pago. | Done |
| CAC-003B | Abrir intento nuevo ante mutación exitosa/cambio válido de dirección; bloquear cambios durante Pending. | Done |
| CAC-004 | Cubrir vacío, retorno, wires inválidos y órdenes cruzados. | Done — unit/integration/browser |
| CAC-005 | Ejecutar gates y doble review de código. | Done — APPROVE sin P0–P3 |
| CAC-006 | PR, CI, merge y verificación post-merge. | Pending |
