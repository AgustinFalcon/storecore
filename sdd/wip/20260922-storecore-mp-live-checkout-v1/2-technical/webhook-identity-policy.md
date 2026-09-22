# Identidad y firma de webhook Orders

**Estado:** propuesta StoreCore para MP-LIVE-02; lista para revisión Sol. No autoriza receptor HTTP.  
**Fuentes oficiales consultadas:** 2026-09-22 — [notificaciones](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro-orders/notifications?scope=prod), [estados (tema `orders_v2`)](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro-orders/payment-management/status/order-status?scope=prod).

## Validador oficial (sin HMAC inventado)

Mercado Pago documenta verificación por SDK/`WebhookSignatureValidator` con exactamente estos insumos:

- header `x-signature` (`ts=…,v1=…`)
- header `x-request-id`
- query `data.id`
- secreto de la aplicación en Tus integraciones (referencia opaca; nunca en repo)

Firma inválida → HTTP 401, **sin** inbox. No se reconstruye el string HMAC en StoreCore; el adapter futuro usa el validador oficial o su contrato equivalente publicado. ACK 200/201 sólo tras commit durable (inbox procesable o cuarentena). MP reintenta a los 15 min si no hay ACK en 22 s.

## IDs que se conservan separados

El ejemplo oficial de la página de notificaciones (consultado 2026-09-22) muestra:

| Campo | Ejemplo oficial | Uso StoreCore |
|---|---|---|
| Query `data.id` | `ORD01JQ4S4KY8HWQ6NA5PXB65B3D3` | Único candidato firmado a `providerOrderId`. |
| Query `type` | `order` | Topic observado; no alias. |
| Body `id` | `123456` | Identidad de notificación; no es order. |
| Body `data.id` | `ORD01JYH1Z1YJN4HZ8J3Q0RB3YP6D` | Distinto del query en el ejemplo. Si existe y ≠ query → cuarentena. |
| Body `type` | `order` | Observado. |
| Body `action` | `order.processed` | Diagnóstico; no acredita. |
| `application_id` / `user_id` | presentes en el ejemplo | Deben coincidir con la instalación. |
| `x-request-id` | UUID | Auditoría y parte del validador. |

La página de estados nombra el tema `orders_v2`. **No** se aceptan `order` y `orders_v2` como aliases hasta muestra de simulador/sandbox (gate residual de Sol, no de este ADR).

## Parser propuesto

1. Rechazar si falta firma, `x-request-id` o query `data.id`.
2. Validar con el contrato oficial. Fallo → 401, cero persistencia procesable.
3. Persistir envelope redactado con los cuatro IDs crudos + topic crudo + resultado de firma.
4. Si query `data.id` coincide con un `provider_order_id` local y body `data.id` está ausente o es igual → `PROCESSABLE`.
5. Si no hay `provider_order_id` aún, o los IDs discordán, o `user_id`/`application_id` no coinciden → `QUARANTINED` + alerta. ACK tras ese commit. Reconciliar luego por `external_reference` única, nunca por inferencia del body.
6. GET canónico: `GET /v1/orders/{query data.id}` (o el `providerOrderId` ya vinculado). Nunca GET por `body.id`.

## Dedupe propuesto (hasta evidencia sandbox)

Clave candidata: `UNIQUE(user_id, body_event_id, query_data_id, x_request_id)`. `body.id` del ejemplo (`123456`) no se trata como único global. La clave final se confirma con muestra de simulador.

## Endpoint legado

Antes de activar `PAYMENTS_MP` para Orders: retirar o reemplazar `POST /api/v1/payments/mercadopago/notifications` y la rama payment del worker V1. La URL actual acepta query/body sin firma.
