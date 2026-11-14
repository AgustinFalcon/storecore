# Implementation summary

- Tipo cerrado `ARS/UNKNOWN` y mapper único de wire.
- Matriz fail-closed antes de pago, pedido, inventario o evidencia.
- Cuarentena sin efectos ante moneda desconocida.
- Suite backend: 405 tests; focal MP Orders: 28 tests.
- Reviews dominio/pagos y seguridad: APPROVE sin P0–P3.
- Tareas: MPC-001..007 completadas.

No habilita red, credenciales, MP-LIVE-05 ni pagos reales.
