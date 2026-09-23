# Decisión MP-01 — Checkout Pro vía Orders API

**Fecha de decisión y consulta de fuentes:** 2026-09-22  
**Estado:** producto decidido; contrato de implementación pendiente de ADR, modelo físico y Sol GO.

## Decisión y alcance

StoreCore v1 mostrará «Pagar con Mercado Pago» y redirigirá en la misma ventana al `checkout_url` devuelto por Checkout Pro vía Orders API. El cliente vuelve a StoreCore para ver el estado. Las tarjetas de crédito/débito y demás medios habilitados se eligen en Mercado Pago, no en un formulario propio. Checkout API/Bricks embebido y Preferences API no se implementan en v1. La experiencia externa no cambia las reglas de verificación server-side.

Tiendanube documenta tanto un checkout transparente como uno externo; esto es una referencia de experiencia, **no** prueba de qué API interna utiliza. Fuente: [Tiendanube, preguntas frecuentes sobre Mercado Pago](https://ayuda.tiendanube.com/es_AR/122921-mercado-pago/preguntas-frecuentes-sobre-mercado-pago).

Mercado Pago recomienda Orders API para integraciones nuevas de Checkout Pro y considera Preferences API el flujo clásico soportado: [referencia comparativa](https://www.mercadopago.com.ar/developers/es/reference/online-payments/checkout-pro-orders/overview).

## Contratos oficiales consultados

| Límite | Evidencia oficial | Consecuencia StoreCore |
| --- | --- | --- |
| Crear checkout | [Crear order](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro-orders/create-order?scope=prod): `POST /v1/orders`, `type=online`, `processing_mode=manual`, `X-Idempotency-Key`; respuesta `id` y `checkout_url`. | Persistir clave por intento lógico y la relación entre ID local y order MP; no exponer token privado al browser. Un retry ambiguo conserva la misma clave. |
| Retorno del browser | [Configurar URLs de retorno](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro-orders/web-integration/configure-back-urls?scope=prod): `config.online.success_url`, `failure_url`, `pending_url`, `auto_return=all`. | UX/reconsulta local únicamente; los parámetros de retorno no acreditan ni facturan. `all` cubre los tres resultados prometidos. |
| Webhook primario | [Notificaciones de pago](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro-orders/notifications?scope=prod): evento Order; query `data.id`, `type`; body `id`, `data.id`; `x-signature` y `x-request-id`; ACK 200/201 y reintentos. | Validar firma/forma/origen e identidades; inbox durable antes de ACK; separar ID de notificación de ID de order. |
| Fuente canónica | [GET order](https://www.mercadopago.com.ar/developers/es/reference/online-payments/checkout-pro/get-order/get): `GET /v1/orders/{id}` devuelve `id`, `user_id`, aplicación, referencia, moneda, montos, estados y transacciones. | Refetch por order ID guardado; comparar merchant, aplicación, referencia, moneda, monto y estado con el snapshot local. |
| Recuperación de creación ambigua | [Buscar Orders](https://www.mercadopago.com.ar/developers/en/reference/online-payments/checkout-pro/search-orders/get): `GET /v1/orders` exige `begin_date`/`end_date`, admite `external_reference` de máximo 64 caracteres y respuesta paginada; [errores posibles](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro-orders/payment-management/integration-errors?scope=prod) distinguen timeout, clave usada, validación fallida y recurso bloqueado. | Intento local durable antes del POST; referencia propuesta `SC-{orderId}-{attemptNo}`. Conciliar exhaustivamente antes de cualquier nueva clave; asociar sólo un match verificado. |
| Estados | [Estado de order](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro-orders/payment-management/status/order-status?scope=prod): `processed/accredited` es acreditación; `created`, `processing`, `failed`, `canceled`, refund y captura pendiente son distintos. | Sólo acreditación completa verificada habilita transición a `PAID`; parcialidad o estado ambiguo requiere conciliación. |
| Reversos | [Reembolsos y cancelaciones](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro-orders/refunds-cancellations?scope=prod), [notificaciones opcionales](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro-orders/optional-notifications?scope=prod). | Cancelación preaprobación no es refund tras captura; parcial y chargeback tienen identidad/política propia. No restock por refund financiero. |

## Ambigüedades oficiales que no se resuelven por suposición

1. La página específica de notificaciones ejemplifica `type=order`; la página de estados llama al tópico `orders_v2`. Además el ejemplo HTTP de la primera muestra `data.id` en query distinto de `body.data.id`. Hasta conservar una muestra de simulador/sandbox, el parser implementable no debe aceptar ambos tópicos como alias ni usar el ID del body en lugar de la query firmada. Un mensaje firmado con IDs discordantes entra sólo en cuarentena durable, sin aplicación comercial; ACK únicamente tras persistirla.
2. La tabla de estados presenta refund total tanto como `processed/refunded` como `refunded/refunded`; el mismo documento usa la segunda forma en el ciclo de vida. No codificar una sola forma como verdad universal sin prueba y revisión.
3. Chargeback tiene un tópico opcional y una fase de disputa; no equivale automáticamente a pérdida final. La política comercial y fiscal downstream queda fuera de esta decisión.
4. La idempotencia remota por intento no garantiza una sola venta si se crean dos Orders para la misma compra. El contrato exige un intento activo por orden local, guarda única de acreditación comercial y conciliación admin para una acreditación remota tardía/duplicada.

## Brecha frente al código actual

`JdbcCartService.checkout` crea sólo orden/pago local `PENDING`; no llama a Mercado Pago ni devuelve `checkout_url`. `payments` conserva `provider_payment_id` pero no `provider_order_id`. `JdbcPaymentService` usa indistintamente query `id` o body `data.id` y persiste sin validar firma MP. `payment_event_inbox.resource_reference` hoy conserva el tópico; `InboxApplicationWorker` consulta el recurso por event ID y `OfficialPaymentResource` sólo tiene ID/referencia/estado, sin merchant, aplicación, moneda ni importes. El worker puede dejar la orden `PAID` tras refund/chargeback. No reutilizar esos caminos en vivo sin ADR y migración revisados.

## Gates

- MP-LIVE-01 (producto y fuentes) queda cerrado **documentalmente**.
- MP-LIVE-02/03: ADR de identidades, parser/firma, seguridad de URL, máquina de estados, reversos, recuperación y modelo físico. Revisión Sol específica antes de código.
- MP-LIVE-04: implementación con doubles sólo tras GO; no implica tráfico real.
- MP-LIVE-05: credenciales fuera del repo, muestras de webhook y E2E en entorno autorizado antes de activar pagos.

La decisión de checkout no autoriza por sí sola integración fiscal ni modifica los gates D-01..D-07/SC-01..SC-07.
