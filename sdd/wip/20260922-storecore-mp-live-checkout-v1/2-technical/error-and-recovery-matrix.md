# Matriz de errores y recuperación — Orders API

**Estado:** propuesta StoreCore para MP-LIVE-02; lista para revisión Sol. No autoriza adapter ni red.  
**Fuentes oficiales consultadas:** 2026-09-22 — [errores](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro-orders/payment-management/integration-errors?scope=prod), [buscar Orders](https://www.mercadopago.com.ar/developers/en/reference/online-payments/checkout-pro/search-orders/get).

## Parámetros operativos propuestos

| Parámetro | Valor propuesto | Motivo |
|---|---|---|
| Margen de reloj de búsqueda | ±5 minutos alrededor de `attemptCreatedAt`…`queriedAt` | Cubrir desfase NTP sin ampliar a un día entero. |
| Ventana máxima de búsqueda | 24 h (`SearchLimits.maxWindow`) | Un intento ambiguo no se busca indefinidamente. |
| Paginación | `limit=20`, máximo 10 páginas; exigir `pagesExhausted` | El ejemplo oficial usa `paging.total_pages`. |
| Fechas | `begin_date`/`end_date` RFC3339 (`2023-01-01T00:00:00Z`) | Contrato de search. |
| Referencia | `SC-{orderId}-{attemptNo}`, ≤64 | Ya cerrado en 02A. |
| Espera `423 resource_locked` | 2 s, máximo 3 reintentos con la **misma** clave | Guía MP: esperar; no nueva clave. |
| Timeout / 5xx de POST | 1 reintento misma clave a los 2 s; luego search | Evitar segundo cargo. |
| Persistencia webhook | Completar commit + ACK en ≤20 s | MP espera 22 s; reintenta a los 15 min. |
| Lease de worker | 2 minutos | Alineado al worker V1. |
| Intento en `RECOVERY_REQUIRED` | 24 h; después alerta admin, sin `TERMINAL_UNPAID` automático | Timeout local no cierra el intento. |

`MpCheckoutAttemptPolicy` ya evalúa ventana, páginas y un único match. Estos números son la entrada que el adapter futuro debe pasar; no se hardcodean en dominio.

## Clasificación POST ` /v1/orders`

| HTTP | Código oficial | Acción StoreCore |
|---|---|---|
| 200/201 con `id` + `checkout_url` HTTPS allowlisted | éxito verificado por el caller | `ReadyForRedirect` sólo tras `VerifiedSuccess`. |
| — | timeout / respuesta perdida | Misma clave → search. Sin URL. |
| 400 | `empty_required_header`, `invalid_idempotency_key_length`, `required_properties`, `invalid_total_amount`, `maximum_items`, `unsupported_properties`, `minimum_properties`, `property_value`, `property_type`, `json_syntax_error` | Error de contrato local: no POST de nuevo con el mismo payload. Corregir intento o fallar a admin. No nueva order. |
| 400 | `idempotency_validation_failed` | Guía MP: nueva clave. StoreCore: **search primero**. Nueva clave sólo si search = cero matches verificados **y** Sol GO de adapter lo autoriza. |
| 400 | `invalid_email_for_sandbox` | Sólo sandbox; no producción. |
| 409 | `idempotency_key_already_used` | Igual: search por referencia; no segunda clave automática. |
| 423 | `resource_locked` | Esperar y repetir la misma clave. |
| 500 | `internal_error` | Reintento misma clave, luego search. |
| 400 GET | `invalid_path_param` | Recovery; no inventar ID. |
| 404 GET | `order_not_found` | Recovery / cuarentena; no aplicar. |

Cero matches, múltiples matches, búsqueda incompleta o candidato con merchant/aplicación/importe/moneda distintos = `RECOVERY_REQUIRED`. Nunca elegir «el primero».

## Orders tardías o duplicadas

- Una segunda `providerOrderId` `processed/accredited` para la misma orden local = incidente `DUPLICATE_REMOTE_CREDIT`, no segunda venta.
- Una order acreditada que llega después de `TERMINAL_UNPAID` (si existiera) o de un intento `SUPERSEDED` = incidente; no ocultar el cargo.
- Search incompleto no autoriza nueva clave.
