# Inventario CFE-T01 — fuente inspeccionada

Baseline `de6a0d7cce780d3db3785468489b237b322b82d9`, rama
`fix/commerce-fulfillment-eligibility`, diff local sin commit.
Descubrimiento por `rg` de CheckoutReceipt/OrderView, los cuatro campos de
estado, ShipmentTransition/RmaTransition, nextShipment/nextRma y writes SQL.

- Backend domain/Commerce.kt: receipt y order DTOs tipados. CommerceStates.kt
  concentra traductores; Fulfillment.kt contiene evidencia/política y pasos.
- JdbcCartService: checkout nuevo y replay; pago de attempt acreditado primero,
  fallback único determinista, ambigüedad Unknown.
- JdbcOrderService/OrderController: CUSTOMER ownership separado, USER/capability,
  CSRF existente, DTOs y coordinación order-first; comandos traducidos al borde.
- FulfillmentUseCase + puertos de evidencia/records: decisión antes de guardar.
  JdbcFulfillmentEvidence carga acreditación, reversión/incidente y SALE/reserva.
  JdbcFulfillmentRecords exige transacción, guarda shipment/event y recepción/items.
- MpOrderApplicationWorker: accredit, terminateUnpaid y reverse se serializan
  antes del lock de attempt. MpCheckoutAttemptService: prepare, post/bind y
  recovery; estados de pedido/pago/attempt tipados y no regresión de ACCREDITED.
- Frontend domain/cart/cart.entity.ts y order/order.entity.ts: receipt/customer/
  admin orders y comandos consumen clases cerradas; reglas en dominio.
- data/mappers/http-mappers.ts: traductor único de todos esos DTOs; wire legacy
  sin acciones/evidencia falla cerrado. data/order/order-http.repository.ts
  serializa sólo command.wire. Repository/use cases/stores mantienen tipos.
- Views de checkout-page/checkout-result, customer-orders/customer-order-detail,
  fulfillment/user-order-detail: etiquetas seguras; acciones sólo coincidentes
  con backend, deshabilitadas mientras carga. Ambas stores recargan tras error
  ambiguo y serializan mutaciones; sin acción de inspección/ajuste.
- Specs de cart/use-cases/checkout, mapper, commerce-states, fulfillment-transition
  y fulfillment.store: instancias en dominio, wires sólo en pruebas de borde.
- CommerceHttpIntegrationTest separa promo y negativo sin pago. Ya no hay
  supuesto happy-path sin acreditar ni assertion alternativa response OR DB.
  MpOrdersCheckoutIntegrationTest usa worker real con puerto oficial fake para
  escenarios positivos, re-reserve, reversión, doble USER, matriz y rollback.

No se encontraron fixtures productivos adicionales de CustomerOrder/AdminOrder
fuera de estos consumidores en src/app. Prototype fixture-only permanece DEMO;
no se usa como evidencia de producción. La regresión PostgreSQL roja inicial no
se ejecutó: Docker/ACL bloqueados; no afirmar reproducción runtime del defecto.
