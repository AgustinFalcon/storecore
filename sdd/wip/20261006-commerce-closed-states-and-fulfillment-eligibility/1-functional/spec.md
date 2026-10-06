# Contrato funcional

## Requisitos y aceptación

- CFE-R01 — OrderStatus, PaymentStatus, ShipmentStatus, RmaStatus y comandos son
  conjuntos cerrados. Un valor desconocido, nulo donde es obligatorio o mal
  formado resulta Unknown. Se muestra una etiqueta segura y ninguna acción;
  jamás el literal recibido. Ausencia legítima de RMA es None, distinta de
  Unknown. Ausencia de shipment es NotCreated, distinta de estado corrupto.
- CFE-R02 — Cada comando de fulfillment exige USER autorizado y capability
  MANUAL_FULFILLMENT/MANAGE, pedido PAID, pago APPROVED acreditado por el flujo
  oficial durable, moneda/importe concordantes y venta WEB consumida completa.
  CREATED, PENDING_PAYMENT, PAID_STOCK_REVIEW, CANCELLED, EXPIRED, REFUNDED y
  Unknown se rechazan, incluso si otro campo dice APPROVED. REJECTED, CANCELLED,
  REFUNDED, CHARGED_BACK, PENDING, pago ausente/ambiguo o Unknown bloquean.
  Retorno de checkout, URL HTTPS, pantalla exitosa y string PAID aislado no son
  prueba de pago. Incidentes de reversión/fraude abiertos bloquean.
- CFE-R03 — Sólo NotCreated/PENDING → PREPARING (PACKED), PREPARING → SHIPPED,
  SHIPPED → DELIVERED. CANCELLED, DELIVERED, Unknown no avanzan. No saltos,
  regresiones ni creación de shipment al rechazar. Tracking conserva el contrato
  actual y las fechas nunca se regeneran ante rechazo/reintento.
- CFE-R04 — RECEIVED inicia una única recepción completa sólo sobre pedido
  elegible y shipment DELIVERED. Todos los ítems originales tienen cantidad
  entera positiva y consumo concordante. Ningún ítem/cantidad se infiere de
  datos enviados por el cliente. La recepción registra RETURN_RECEIVED y las
  cantidades originales, sin inspección ni ajuste. Un RMA histórico existente
  de cualquier estado bloquea otra creación en este corte.
- CFE-R05 — INSPECTED y ADJUSTED se rechazan siempre sin cambiar returns,
  return_items, balances, ledger ni auditoría de ajuste. No se escribe RESTOCK
  implícito. Los históricos INSPECTED/CLOSED siguen legibles con tipos cerrados;
  no se reabren, reponen ni reinterpretan como aprobación futura. La UI explica
  que disposición/reposición está pendiente de implementación y no ofrece esas
  acciones. RMA parcial, dañado/rechazado y reembolso son no-go en este corte.
- CFE-R06 — Dos operadores y las carreras con pago/reversión producen una única
  transición válida persistida. Repetir un comando ya aplicado se rechaza con
  el error de transición actual y sin repetir eventos o efectos. Después de
  timeout se recarga estado autoritativo antes de reintentar; no se promete
  reproducción de respuesta mediante idempotency key inexistente.
- CFE-R07 — Lecturas y controles de storefront, checkout y fulfillment consumen
  los tipos; el backend decide la elegibilidad. UI desactualizada no habilita un
  comando inválido. CUSTOMER/USER, ownership, CSRF y capability siguen separados.
- CFE-R08 — Pruebas pagan por el worker con recurso oficial simulado y verifican
  aplicación comercial, reserva consumida y ledger real antes de despachar.
  El caso sin pago es negativo. Respuesta, readback y efectos persistidos deben
  coincidir; un assertion alternativo UI **o** DB no satisface aceptación.

## No objetivos

Sin integración operativa BlackStore/POS, SaaS, store_id, carriers/Correo,
facturación/ARCA, credenciales o pagos live, reembolsos automáticos, cancelación
nueva, conciliación/reparación de pedidos históricos, devolución parcial,
disposición/restock, nueva librería de estado frontend o refactor general de
inventario/promociones. No inventar DDL de ventas: se usa la evidencia comercial
durable y SALE WEB existentes. No activar capabilities como parte del cambio.
