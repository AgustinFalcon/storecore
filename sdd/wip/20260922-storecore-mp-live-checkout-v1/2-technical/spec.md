# Especificación técnica — Mercado Pago live checkout

**Estado:** `documented_deferred` · **Fecha:** 2026-09-22

## Límite

Producto elegido: Checkout Pro externo vía Orders API; no Checkout API embebido ni Preferences API en v1. Este WIP todavía no autoriza adapter, endpoint, migración, worker ni secreto implementable. El adapter local actual no constituye integración MP real: el recurso oficial debe ser obtenido por HTTP desde el servidor con la credencial aislada y sólo después de validar origen, shape, topic e IDs de la notificación. El mensaje validado se persiste durablemente antes del ACK; un fallo anterior al commit es retryable. Las fuentes oficiales, las discrepancias y los gates están en [la decisión técnica](checkout-pro-orders-decision.md).

## Contrato seleccionado y límite de confianza

- `POST /v1/orders`: `type=online`, `processing_mode=manual`, monto y líneas consistentes, `external_reference` único/estable por intento (formato propuesto `SC-{orderId}-{attemptNo}`, máximo 64 caracteres) y `X-Idempotency-Key` UUID persistida por intento lógico. Crear y confirmar **antes del POST** un intento local con referencia, clave, hash del request y estado. El POST ocurre fuera de la transacción DB; se vincula `providerOrderId` único y `checkout_url` en una transacción posterior **antes de redirigir**. La URL devuelta por Mercado Pago es la única URL de checkout admitida y se valida contra hosts HTTPS autorizados antes de redirigir.
- Si el POST remoto pudo prosperar pero la respuesta o el commit local falló, no crear otra clave ni otro intento. Para timeout sin respuesta se puede repetir el mismo request/clave mientras el contrato lo permita; `423 resource_locked` exige esperar, mientras que `400 idempotency_validation_failed` y `409 idempotency_key_already_used` indican nueva clave en la guía MP, **pero StoreCore no la genera automáticamente** hasta conciliar si la order anterior existe. Buscar Orders por referencia exacta, `begin_date`/`end_date` RFC3339 que cubran desde la creación del intento hasta la consulta (con margen de reloj), y paginar hasta agotar `paging`. Verificar identidad/montos de todos los resultados y vincular sólo si hay un único match; cero, múltiples, consulta incompleta o error quedan en conciliación sin checkout URL ni nuevo intento. Este recovery usa [búsqueda oficial](https://www.mercadopago.com.ar/developers/en/reference/online-payments/checkout-pro/search-orders/get) y [matriz de errores oficial](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro-orders/payment-management/integration-errors?scope=prod). El ADR debe cerrar margen, límites y clasificación final antes de código.
- `config.online.success_url`, `failure_url`, `pending_url` y `auto_return=all` devuelven al comprador para UX/reconsulta; no confirman el cobro.
- Webhook Order: validar `x-signature` con `x-request-id`, query `data.id` y secreto según contrato oficial; `body.id` es identidad de notificación, query `data.id` es candidato a ID de order. Para procesar, la query firmada debe identificar el `providerOrderId` guardado y el GET debe devolver el mismo ID. Si `body.data.id` está presente y difiere de query `data.id`, o el ID no está asociado, persistir en cuarentena durable y alertar; ACK exitoso sólo después de ese commit, nunca aplicación comercial. El ejemplo oficial muestra query y body distintos, así que no se asume que ambos sean aliases válidos. Validar cuenta/aplicación y entorno configurados, tópico/forma/IDs; persistir la notificación validada y el trabajo pendiente antes del ACK 200/201. Un fallo de persistencia no recibe ACK exitoso. La página de estados dice `orders_v2` y la página de notificaciones ejemplifica `type=order`; no aceptar aliases por inferencia antes de evidencia del simulador/sandbox.
- Worker: consultar `GET /v1/orders/{providerOrderId}` (nunca por ID de notificación) y exigir ID, referencia externa, `user_id`, `integration_data.application_id`, moneda, importe total y pagado compatibles con la instalación y el snapshot local. `processed/accredited` con total pagado esperado reconoce la acreditación financiera; la transición comercial `PAID` exige además consumir todas las líneas reservadas/no vencidas o re-reservadas con stock revalidado. Si la reserva venció y falta stock, `PAID_STOCK_REVIEW` e incidente admin, sin venta verificada/fulfillment. Estados incompletos, desconocidos o ambiguos se concilian sin efectos irreversibles.

## Modelo lógico requerido

| Identidad | Uso |
| --- | --- |
| `providerNotificationIdentity` | Dedupe del mensaje recibido, definido por producto; puede ser ID único o compuesto por topic/evento/recurso. |
| `providerOrderId` | ID `ORD...` de la order canónica; se guarda al crearla, es único y nunca se reemplaza por el ID de notificación o pago. |
| `providerPaymentId` | ID de la transacción de pago dentro de la order, si está presente; distinto de `providerOrderId`. |
| `checkoutAttemptId` | Identidad local durable del intento; un solo intento activo por orden local y referencia remota única por intento. |
| `externalReference` | Correlación estable entre recurso remoto y una orden/pago local. |
| `paymentApplicationId` | Clave estable de la transición comercial idempotente. |
| `verifiedBusinessEventId` | Clave estable del evento posterior a la verificación, apto para consumidores autorizados. |

Antes de cualquier DDL, el ADR debe mapear ID de notificación, topic, evento, `data.id`, order, transacción de pago, refund y chargeback. El fallback de un recurso al ID de notificación no es admisible. El recurso remoto debe contener evidencia suficiente para comprobar merchant/cuenta esperada, aplicación, importe, moneda, referencia externa y estado. El modelo actual `OfficialPaymentResource` sólo contiene ID, referencia y estado; `payments` sólo guarda `provider_payment_id`; `payment_event_inbox.resource_reference` contiene hoy el tópico y el worker consulta por event ID. Todo esto requiere un diseño de migración revisado, no un simple cambio de adapter.

## Secuencia propuesta

```text
intento local durable → remote checkout creation/recovery adapter
  → asociación durable local con providerOrderId antes de checkout_url
  ├→ retorno/browser: sólo UX y reconsulta local
  └→ webhook: product-specific origin/shape/topic/ID validator
       → durable provider notification inbox before ACK
       → official HTTP GET order/refetch
       → correlation and value verifier
       → idempotent payment application
       → explicit state transition + verified business event
```

La creación del checkout remoto, la validación del mensaje y el refetch usan el contrato oficial fechado de Checkout Pro/Orders API. Los secretos quedan detrás de una referencia opaca a un secret store aprobado. Logs, métricas y payloads persistidos se minimizan/redactan. Un retorno/browser puede informar UX, pero no entra al inbox ni autoriza transición alguna. El evento de notificación y el recurso se correlacionan con la order previamente creada; un recurso desconocido o con campos divergentes queda en conciliación, no se marca procesado como venta válida.

La aplicación usa una identidad estable por `(providerOrderId, transition)` **y** una guarda única de acreditación comercial por orden local; el evento posterior usa `verifiedBusinessEventId`, con constraints propios. Múltiples notificaciones o dos provider Orders aprobadas no duplican venta, consumo de stock ni evento; la segunda acreditación remota se registra como incidente financiero para conciliación/devolución admin, nunca se oculta. Sólo un intento remoto puede estar activo a la vez; uno nuevo requiere cierre remoto terminal verificado del anterior, nunca sólo timeout local. La transacción aprobada persiste atómicamente la aplicación, la transición de orden/pago/inventario definida por contrato, el evento y su outbox. Refund, chargeback, parcialidad y orden de llegada usan IDs de refund/chargeback/transacción propios y no se deducen de la notificación.

## Estados y recuperación

Las transiciones de pendiente, acreditada, fallida y cancelada se aplican sólo con el par `status/status_detail` y montos verificados. La reserva WEB V1 dura 30 minutos y `consumeSaga` puede devolver cero; el conteo de líneas y el vencimiento se verifican antes de `PAID`. Si expiró, la re-reserva requiere nuevas claves de saga/línea y stock suficiente para todas las líneas; si falla, se persiste incidente `PAID_STOCK_REVIEW` sin perder el pago financiero ni despachar. La fuente oficial ofrece dos representaciones de refund total (`processed/refunded` y `refunded/refunded`); ninguna se fija como única por inferencia. Refund parcial/total y chargeback requieren decisión sobre estado comercial, RMA, fulfillment, stock y evento downstream: el schema actual permite `REFUNDED` en orden pero no `CHARGED_BACK`, y el worker local mantiene la orden `PAID` para ambos. Hasta aprobar esa política deben quedar en cuarentena/revisión administrativa visible, sin restock automático ni emisión/corrección fiscal por inferencia. Fallos de refetch son reintentables; discrepancias o estados no reconocidos se concilian y no generan `VerifiedBusinessEvent`.

## Pruebas exigidas antes de activar

1. Doubles del adapter oficial para aprobado, rechazado, cancelado, refund, chargeback y estado desconocido.
2. Notificación repetida, recurso repetido, dos workers y reanudación tras caída.
3. Merchant, importe, moneda y referencia incorrectos.
4. Firma, tópico, identidad o notificación inválida para el contrato de Orders API; muestras reales/simuladas `order` versus `orders_v2` antes de live.
5. Timeout/refetch ambiguo y conciliación sin doble transición.
6. POST remoto exitoso con respuesta perdida o commit local fallido; búsqueda por referencia con cero, uno y múltiples matches.
7. Dos intentos remotos para una orden local, aprobación tardía, query/body `data.id` discrepantes y `auto_return=all` sin acreditación por browser.

La selección de producto y las fuentes están documentadas, pero el ADR/modelo físico, la evidencia de webhook y las políticas de reversos permanecen sujetos al GO de Sol. Credenciales sólo se requieren para sandbox/E2E; las pruebas con doubles no las requieren después de un GO de código específico.
