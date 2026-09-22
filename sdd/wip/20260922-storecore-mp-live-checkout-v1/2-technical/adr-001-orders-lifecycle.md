# ADR-001 propuesto — Ciclo de vida Checkout Pro/Orders

**Estado:** MP-LIVE-02 `ready_for_sol_review`. Propuesta cerrada de contrato; no implementable ni aprobada para código.  
**Fecha:** 2026-09-22.  
**Contexto:** una instalación StoreCore representa un solo comercio. El checkout actual sólo crea orden/pago local pendiente; el inbox/worker V1 son de forma genérica y no validan Orders API.  
**Anexos:** [matriz de errores](error-and-recovery-matrix.md), [webhook](webhook-identity-policy.md), [reversos y stock](reversal-and-stock-policy.md), [modelo físico](data-model-proposal.md).

## Decisiones propuestas

1. **Fuente de pago.** Checkout Pro externo vía Orders API. `POST /v1/orders` usa `type=online`, `processing_mode=manual`; el navegador recibe únicamente el `checkout_url` que devolvió Mercado Pago, después de vincular durablemente la order. `config.online.auto_return=all` sirve sólo a UX. La transición a pagado exige webhook firmado, inbox durable y GET oficial compatible con el snapshot local.
2. **Identidad.** Cada orden local tiene uno o más intentos históricos, pero a lo sumo uno activo. `orderId` es `orders.id BIGINT` (Kotlin `Long`); `external_reference=SC-{orderId}-{attemptNo}` (máximo 64 caracteres), única e inmutable por intento. La UUID `X-Idempotency-Key` y hash del request se persisten antes del POST. `providerOrderId` es el ID remoto canónico; `providerPaymentId`, ID de notificación y IDs de reversos son distintos.
3. **Recuperación.** Un intento queda sin URL ante timeout, POST con resultado incierto o commit local fallido. No se crea otro intento ni clave hasta resolverlo. Parámetros y matriz HTTP: [error-and-recovery-matrix.md](error-and-recovery-matrix.md) (±5 min, ventana 24 h, `limit=20` / 10 páginas, `423` espera misma clave, `400/409` idempotencia = search antes de cualquier clave nueva).
4. **Webhook.** Validador oficial (`x-signature`, `x-request-id`, query `data.id`, secreto de instalación). Sin HMAC inventado. IDs y cuarentena: [webhook-identity-policy.md](webhook-identity-policy.md). `order` vs `orders_v2` no son aliases hasta muestra sandbox.
5. **Aplicación.** Worker: lease corto → GET order fuera de TX → lock intento/orden/stock. Dedup `(providerOrderId, transición)` + una acreditación por orden local. Segunda order remota acreditada = incidente, no segunda venta.
6. **Reversos y stock tardío.** Política conservadora cerrada como propuesta: [reversal-and-stock-policy.md](reversal-and-stock-policy.md). Refund/chargeback = `UNDER_REVIEW` sin restock/fiscal. `PAID` exige consumo completo; si no, `PAID_STOCK_REVIEW`.

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

## Qué queda para Sol (no bloquea el cierre documental de 02)

1. Aprobar o enmendar esta propuesta (matriz, webhook, reversos, modelo).
2. Muestra de simulador/sandbox que confirme o descarte el alias `order`/`orders_v2` y la clave de dedupe.
3. GO específico de **código** para MP-LIVE-03 (adapter/DDL). 04/05 siguen bloqueados.

Fuentes: [crear order](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro-orders/create-order?scope=prod), [buscar Orders](https://www.mercadopago.com.ar/developers/en/reference/online-payments/checkout-pro/search-orders/get), [errores](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro-orders/payment-management/integration-errors?scope=prod), [notificaciones](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro-orders/notifications?scope=prod), [GET order](https://www.mercadopago.com.ar/developers/es/reference/online-payments/checkout-pro/get-order/get), [estados](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro-orders/payment-management/status/order-status?scope=prod). Consultadas 2026-09-22.
