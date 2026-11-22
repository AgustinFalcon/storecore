# Diseño técnico

Se amplía la clasificación SQL cerrada de `JdbcOverviewRepository`: `READY_FOR_PICKUP` es un estado activo de cola y se traduce a `OverviewShipmentState.READY_FOR_PICKUP`; `PICKED_UP` es terminal válido y queda fuera de la cola. No se relajan las pruebas de autoridad de pago.
