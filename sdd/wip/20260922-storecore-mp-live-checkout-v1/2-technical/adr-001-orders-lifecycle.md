# ADR-001 propuesto — Ciclo de vida Checkout Pro/Orders

**Estado:** propuesta para MP-LIVE-02/03; no implementable ni aprobada por Sol.  
**Fecha:** 2026-09-22.  
**Contexto:** una instalación StoreCore representa un solo comercio. El checkout actual sólo crea orden/pago local pendiente; el inbox/worker V1 son de forma genérica y no validan Orders API.

## Decisiones propuestas

1. **Fuente de pago.** Checkout Pro externo vía Orders API. `POST /v1/orders` usa `type=online`, `processing_mode=manual`; el navegador recibe únicamente el `checkout_url` que devolvió Mercado Pago, después de vincular durablemente la order. `config.online.auto_return=all` sirve sólo a UX. La transición a pagado exige webhook firmado, inbox durable y GET oficial compatible con el snapshot local.
2. **Identidad.** Cada orden local tiene uno o más intentos históricos, pero a lo sumo uno activo. `orderId` es `orders.id BIGINT` (Kotlin `Long`); `external_reference=SC-{orderId}-{attemptNo}` (máximo 64 caracteres), única e inmutable por intento. La UUID `X-Idempotency-Key` y hash del request se persisten antes del POST. `providerOrderId` es el ID remoto canónico; `providerPaymentId`, ID de notificación y IDs de reversos son distintos.
3. **Recuperación.** Un intento queda sin URL ante timeout, POST con resultado incierto o commit local fallido. No se crea otro intento ni clave hasta resolverlo. Se puede repetir el mismo request/key sólo según la respuesta oficial; `423 resource_locked` espera. Para `400 idempotency_validation_failed` o `409 idempotency_key_already_used`, la guía MP sugiere nueva clave, pero antes StoreCore debe buscar por la referencia exacta y evaluar la orden potencialmente creada. `GET /v1/orders` requiere ventana RFC3339 `begin_date/end_date`, referencia <=64 y paginación completa. El ADR final debe fijar márgenes de reloj, límites de páginas/reintentos y expiración; una búsqueda incompleta, cero o múltiples matches queda `RECOVERY_REQUIRED`, sin URL ni otro intento. Un único match sólo se vincula tras verificar ID, referencia, merchant, aplicación, monto y moneda.
4. **Webhook.** Validar `x-signature` con `x-request-id` y query `data.id` antes del inbox procesable. `body.id`, query `data.id` y body `data.id` se conservan separados. Un mensaje inválido no recibe ACK exitoso. Uno firmado pero sin asociación o con IDs discordantes va a cuarentena durable y recibe ACK sólo después del commit, sin efectos de negocio. No aceptar `order` y `orders_v2` como aliases hasta prueba de simulador/sandbox: la documentación oficial usa ambos nombres y un ejemplo muestra IDs de query/body distintos.
5. **Aplicación.** Worker reclama una notificación en transacción corta, obtiene `GET /v1/orders/{providerOrderId}` fuera de esa transacción y después bloquea intento/orden local para comparar ID, referencia, `user_id`, `integration_data.application_id`, moneda, total, total pagado y `processed/accredited`. La aplicación se deduplica por `(providerOrderId, transición)` y por acreditación única de orden local. Orden/pago, consumo de reserva, evento comercial verificado y outbox se confirman atómicamente. Una segunda order remota aprobada para la misma compra es incidente financiero, no segunda venta.
6. **Reversos.** Refund total/parcial, chargeback y fraude se conservan como casos `UNDER_REVIEW`, con alerta admin, bloqueo de efectos irreversibles pendientes y sin restock/fiscal automático. Chargeback iniciado no equivale a pérdida final. El restock sólo sucede tras devolución física, recepción, inspección y ajuste aprobado. Falta aprobar transiciones comerciales y operación de corrección antes de live.
7. **Pago acreditado con reserva vencida.** La reserva WEB V1 vence a los 30 minutos; un pago MP puede acreditarse o notificarse después. Nunca marcar `PAID` sólo por `processed/accredited` si no se consumió la totalidad de líneas. Bajo locks de orden/reservas/balances, comprobar que cada reserva sigue `ACTIVE` y `expires_at` futura; consumir exactamente el número y cantidades esperados en la misma transacción que la aplicación comercial. Si ya expiró, intentar una **nueva** reserva con claves de saga/línea distintas de V1 y stock revalidado, seguida de consumo atómico. La función V1 `reserve` devuelve el ID existente incluso si está `EXPIRED`, así que no sirve para esta recuperación sin cambio revisado. Si falta stock o la recuperación es ambigua, conservar el pago financiero como acreditado, poner la orden en `PAID_STOCK_REVIEW`, bloquear fulfillment, registrar incidente visible para admin y no emitir evento de venta verificada ni hacer fiscal automático. El admin decide reposición/entrega o devolución; el pago nunca se pierde ni se presenta como venta entregable sin stock.

## Secuencia transaccional propuesta

```text
TX1: lock orden local → crear/reusar intento activo + referencia/key/hash/snapshot → commit
POST MP fuera de TX
TX2: asociar providerOrderId + checkout_url validado → commit → redirigir
si POST/commit ambiguo: marcar recuperación → buscar/refetch fuera de TX → TX para vincular match único o cuarentena
webhook: validar firma/forma → TX inbox o cuarentena + processing → commit → ACK 200/201
worker: lease corto → GET order fuera de TX → TX lock intento/orden/stock + verificar + consumir completo o PAID_STOCK_REVIEW + evento/outbox/alerta correspondientes → commit
```

Ninguna llamada remota se hace mientras se mantiene un lock DB. Un retorno del browser sólo reconsulta el estado local. Si un mensaje llega antes de vincular el `providerOrderId`, se cuarentena y luego se reconcilia por referencia única; no se aplica por inferencia.

## Alternativas descartadas para v1

- Checkout embebido/Bricks: aumenta superficie de interfaz; puede evaluarse después sin cambiar el contrato comercial verificado.
- Preferences API: soportada como flujo clásico, pero Mercado Pago recomienda Orders API para integración nueva.
- Reusar `payment_event_inbox`/`InboxApplicationWorker` V1 tal como están: mezclan ID de evento y recurso, refetch por event ID y carecen de merchant/importe/moneda; sería inseguro habilitarlos para Orders.
- Crear una nueva clave/orden por cada timeout: abre la posibilidad de dos cargos remotos para la misma compra.

## Decisiones pendientes para Sol GO

- Evidencia fechada de webhook real/simulado (`order`/`orders_v2`, query/body IDs y firma) y parser/versionado aprobado.
- Parámetros operativos de búsqueda, retry y clasificación completa de errores; política de orders tardías o duplicadas.
- Modelo físico de [propuesta aditiva](data-model-proposal.md), compatibilidad/migración V1 y pruebas de concurrencia.
- Política comercial final de refund, chargeback, fraude, pago acreditado sin stock, RMA, fulfillment y downstream fiscal externo.

Fuentes: [crear order](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro-orders/create-order?scope=prod), [buscar Orders](https://www.mercadopago.com.ar/developers/en/reference/online-payments/checkout-pro/search-orders/get), [errores](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro-orders/payment-management/integration-errors?scope=prod), [notificaciones](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro-orders/notifications?scope=prod), [GET order](https://www.mercadopago.com.ar/developers/es/reference/online-payments/checkout-pro/get-order/get), [estados](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro-orders/payment-management/status/order-status?scope=prod). Consultadas 2026-09-22.
