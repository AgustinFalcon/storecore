# Especificación funcional — Mercado Pago live checkout

**Estado:** `documented_deferred` · **Fecha:** 2026-09-22

## Propósito

La venta StoreCore sólo cambia a pagada cuando el producto Mercado Pago aprobado confirma la operación mediante su recurso oficial y las comprobaciones locales. El checkout actual crea una orden y pago locales pendientes; este WIP define el contrato para abrir el checkout remoto sin confundir la recepción de una notificación con un cobro válido.

## Decisión de experiencia

V1 usa **Checkout Pro vía Orders API** con redirección en la misma ventana. El comprador ve «Pagar con Mercado Pago», sale al `checkout_url` provisto por Mercado Pago y vuelve a StoreCore por una URL de éxito, rechazo o pendiente (`auto_return=all`). Crédito y débito se eligen en Mercado Pago. No habrá formulario de tarjeta embebido en StoreCore; Checkout API/Bricks y Preferences API quedan fuera de v1. La vuelta sólo presenta el estado local o «Estamos confirmando tu pago»: no acredita una venta.

## Decisiones todavía abiertas

- Forma/tópico real de webhook de Orders API y normalización de identidad, sujeto a evidencia simulada/sandbox por contradicción entre páginas oficiales.
- Política comercial de reembolsos totales/parciales, contracargos y alertas de fraude: estados de orden, fulfillment, RMA, stock y revisión administrativa.
- Política fiscal que eventualmente consume un evento comercial verificado; no forma parte de este checkout.

Un pedido local admite **a lo sumo un intento de pago remoto activo**. Repetir el mismo checkout reutiliza el intento y la misma clave de idempotencia. No se abre otro intento mientras la creación o el estado del anterior sean ambiguos. Sólo se habilita uno nuevo tras verificar que el anterior terminó sin posibilidad de acreditación según contrato; si aparece una acreditación tardía o duplicada, se bloquean nuevos efectos comerciales, se registra el incidente para conciliación y un admin resuelve la devolución financiera según el procedimiento aprobado. La unicidad de la venta local no implica que dos cargos remotos se cancelen solos.

## Flujo futuro

```text
cliente inicia checkout StoreCore
  → confirma intento local durable (referencia, monto, clave idempotente)
  → servidor crea o recupera una order MP para ese intento
  → persiste la asociación local con order MP y entrega checkout_url
  → cliente completa Checkout Pro en Mercado Pago
  ├→ retorno al navegador: UX/reconsulta local, sin aplicar pago
  └→ notificación al servidor
       → valida origen, shape, topic e IDs según contrato oficial
       → inbox durable antes de ACK
       → consulta server-side GET /v1/orders/{id}
       → verifica merchant, importe, moneda y referencia externa
       → transición comercial idempotente
       → evento comercial verificado
```

El validador rechaza o clasifica como retryable cualquier fallo anterior al commit durable; sólo confirma ACK después de persistir. En el ejemplo oficial, `body.id` identifica la notificación y `data.id` la order MP; tampoco equivalen al ID de pago interno. El dedupe exacto se cierra con el contrato validado. Un retorno del navegador sólo actualiza UX: nunca crea inbox ni es una fuente autoritativa. Una notificación repetida, un evento local fake o una referencia no correlacionada no marcan una orden como pagada.

## Transiciones propuestas, pendientes del contrato elegido

| Resultado remoto verificado | Orden | Pago | Inventario | Evento posterior |
| --- | --- | --- | --- | --- |
| `processed/accredited`, importe total verificado | transición a estado pagado | aplicada como aprobada | consume o confirma según reserva aprobada | `VerifiedBusinessEvent` único |
| Acreditado, reserva vencida y stock insuficiente | `PAID_STOCK_REVIEW` propuesto: hecho financiero visible, venta no despachable | aprobada financieramente, con incidente admin | no consumir parcialmente ni inventar stock | sin evento de venta verificada ni fiscal automático; revisión de devolución/entrega |
| Rechazado | conserva/cancela según política aprobada | aplicada como rechazada | libera reserva si corresponde | evento de rechazo, no fiscal |
| Cancelado | cancela según política aprobada | aplicada como cancelada | libera reserva si corresponde | evento de cancelación, no fiscal |
| Refund total o parcial | no cerrar automáticamente como venta válida; cuarentena y revisión admin hasta política aprobada | registrar evidencia financiera sin inventar transición comercial | jamás restock automático; requiere recepción, inspección y ajuste | evento downstream pendiente; una factura emitida no se «cancela» por inferencia |
| Chargeback iniciado o resuelto | cuarentena y revisión admin; una disputa no equivale necesariamente a pérdida final | registrar fase de disputa sin asumir resolución | detener acciones irreversibles pendientes, sin restock automático | evento downstream pendiente; sin emisión o corrección fiscal automática |
| Fuera de orden, parcial o discrepante | sin transición automática | sin aplicación automática | sin cambio | conciliación/revisión |

La tabla distingue los estados documentados de Checkout Pro/Orders API de la política StoreCore aún pendiente. Antes de automatizar refund o chargeback se necesita una decisión explícita sobre estado comercial, devolución/RMA, fulfillment, stock y evento downstream; `JdbcOrderService.rma` hoy exige una orden `PAID`. El worker actual deja la orden `PAID` tras refund/chargeback; eso no puede operar silenciosamente en vivo. Pagos parciales, recursos fuera de orden y cambios posteriores van a conciliación, no a acreditación automática.

## Criterios futuros

- La operación remota queda asociada a una única orden/pago StoreCore mediante referencia aprobada.
- Un mensaje repetido o dos workers no duplican la aplicación comercial.
- Dos orders remotas, incluso si llegan aprobadas, no producen dos ventas ni dos consumos de inventario para el mismo pedido local; la segunda acreditación es incidente financiero visible.
- Importe, moneda, merchant y estado remoto se verifican antes de cada transición.
- Una acreditación tardía sólo marca `PAID` si se consumen todas las líneas de inventario esperadas; con stock insuficiente queda en revisión visible sin despacho, nunca se pierde el hecho financiero.
- Refund y chargeback quedan visibles para revisión admin hasta aprobar transiciones explícitas, idempotentes y auditables.
- El evento entregado a fiscal deriva de una aplicación comercial verificada, nunca de la notificación sola.
- Cada transición autorizada persiste de forma atómica la aplicación, el evento posterior y el outbox que corresponda.
