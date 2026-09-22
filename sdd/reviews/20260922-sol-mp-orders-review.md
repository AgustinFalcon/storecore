# Sol review — Checkout Pro externo vía Orders API

**Fecha:** 2026-09-22  
**WIP:** `sdd/wip/20260922-storecore-mp-live-checkout-v1/`  
**Alcance:** revisión documental read-only tras decisión de producto; sin revisión de código nuevo.

## Dictamen

**GO documental** para cerrar MP-LIVE-01: Checkout Pro con redirección en la misma ventana mediante Orders API, sin checkout embebido/Preferences en v1. **NO-GO de código**, incluso parcial, y NO-GO de activación live. La elección de producto no autoriza adapter, DDL, secreto, endpoint o worker.

La revisión encontró y el WIP incorporó tres riesgos P1: un segundo intento remoto puede cobrar dos veces la misma compra, un POST exitoso puede perder la respuesta o fallar el commit local, y el ejemplo oficial de webhook muestra IDs de query/body discordantes. El contrato documental exige intento local durable antes del POST, recuperación/conciliación sin nuevo intento automático, guarda única de acreditación comercial por orden local y cuarentena durable sin efectos para identidades discordantes. `auto_return=all` sólo afecta UX; nunca acredita por el navegador.

## Gates residuales para GO de código

1. ADR y modelo físico/migración de intentos, `providerOrderId`, dedupe por recurso/transición, cuarentena, worker y recuperación. Revisar restricciones de unicidad por intento y por orden local.
2. Matriz final de errores de Orders: timeout, `resource_locked`, `idempotency_validation_failed`, `idempotency_key_already_used`, búsqueda paginada por referencia y caso sin match/múltiples matches. Las guías de MP sugieren una clave nueva para ciertos errores; StoreCore no debe crear otro cargo sin conciliación.
3. Evidencia real/simulada y parser versionado para la discrepancia `type=order` frente a `orders_v2`, y para query `data.id` frente a body `data.id`; firma y autenticación probadas antes del inbox procesable.
4. Política comercial final de refund parcial/total, chargeback y fraude: orden, RMA, fulfillment, stock y downstream fiscal. Mientras esté abierta, sólo cuarentena/revisión admin visible; no dejar orden `PAID` silenciosamente ni restock por refund financiero.
5. GO específico de Sol sobre contrato implementable y tareas. Credenciales MP sólo para sandbox/E2E posterior, nunca en repo o CI.

## Fuentes oficiales consultadas

- [Checkout Pro Orders frente a Preferences](https://www.mercadopago.com.ar/developers/es/reference/online-payments/checkout-pro-orders/overview).
- [Crear order](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro-orders/create-order?scope=prod), [buscar Orders](https://www.mercadopago.com.ar/developers/en/reference/online-payments/checkout-pro/search-orders/get) y [errores posibles](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro-orders/payment-management/integration-errors?scope=prod).
- [Notificaciones](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro-orders/notifications?scope=prod), [GET order](https://www.mercadopago.com.ar/developers/es/reference/online-payments/checkout-pro/get-order/get) y [estados](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro-orders/payment-management/status/order-status?scope=prod).

La integración fiscal externa conserva sus gates D-01..D-07/SC-01..SC-07 independientes.
