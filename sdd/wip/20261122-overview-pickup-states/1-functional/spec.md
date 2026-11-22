# Overview de retiro

El dashboard debe aceptar `READY_FOR_PICKUP` como trabajo de fulfillment pendiente y `PICKED_UP` como entrega finalizada. Ninguno puede invalidar toda la cola. Los valores desconocidos siguen fallando cerrados.

## Aceptación

- Una orden acreditada lista para retirar aparece en la cola con estado cerrado conocido.
- Una orden retirada no aparece como trabajo pendiente ni vuelve indisponible la cola.
- Los estados no reconocidos mantienen `SHIPMENT_FACTS_INCOMPLETE`.
