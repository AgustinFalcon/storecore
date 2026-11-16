# Especificación funcional — reconciliación #8/#13

## Regla de producto

La evidencia manda sobre el texto histórico. Un criterio puede quedar:

- `Satisfied`: comportamiento literal probado.
- `Reconciled`: una decisión posterior aprobada cubre el resultado sin conservar
  la forma histórica.
- `Deferred`: requiere un corte propio o dependencia externa.
- `Unknown`: no hay evidencia suficiente y falla cerrado.

Son estados cerrados; la documentación, los comentarios de issue y cualquier
future dashboard usan el mismo tipo, no strings inventados.

## Issue #8 — fulfillment

| Criterio histórico | Estado | Autoridad vigente |
|---|---|---|
| Checkout selecciona método habilitado desde configuración | `Satisfied` | `PICKUP` y `LOCAL_DELIVERY`, política versionada, costo/plazo y snapshot autoritativo. |
| Pickup no exige `SHIPPED` | `Satisfied` | Journey `PENDING → PREPARING → READY_FOR_PICKUP → PICKED_UP`; tracking rechazado. |
| `READY_TO_SHIP` existe sólo en shipment | `Reconciled` | ORDER no contiene logística. Shipment usa `PREPARING`; no se agrega un alias sin nueva necesidad de negocio. |
| `SELF_SHIP` y `CARRIER` literales | `Deferred` | `LOCAL_DELIVERY` cubre entrega manual local; `CARRIER` permanece deshabilitado hasta contrato/homologación. |
| Tracker comprador | `Satisfied` local | Timeline tipado, snapshot y tracking manual; no acredita tracking oficial. |
| Emails logísticos | `Deferred` | Requieren eventos/outbox/templates/consentimiento/worker en un SDD independiente. |

La decisión de entrega ya vive en `checkout_snapshot.delivery`; no se duplica en
otra columna `fulfillment_method`. Un editor ADMIN visual de la política manual es
una mejora separable: la API autoritativa ya existe y el issue no autoriza por sí
solo una nueva superficie.

## Issue #13 — storefront

| Criterio histórico | Estado | Autoridad vigente |
|---|---|---|
| Shell/PDP/branding merchant | `Satisfied` | Angular 22, CSS variables, branding persistido, catálogo y PDP productivos. |
| Visitante agrega variante a carrito cookie | `Reconciled` | Fase 1 exige CUSTOMER. Anónimo conserva intención exacta 15 min, autentica, relee producto/carrito y confirma explícitamente. |
| Checkout exige CUSTOMER | `Satisfied` | Carrito y checkout están protegidos por política CUSTOMER cerrada. |
| Resultado no presume webhook y relee orden | `Satisfied` local | GET autoritativo al entrar/recargar; estados de pago/orden cerrados y `Unknown` fail-closed. |
| Polling/botón de actualización | `Deferred` opcional | Corte UX local pequeño; no es prueba de pago ni requisito para leer al recargar. |
| `back_urls`/retorno Mercado Pago live | `Deferred` | Pertenece a `20260922-storecore-mp-live-checkout-v1`, MP-LIVE-05 y homologación. |

La política CUSTOMER-only prevalece sobre el guest cart histórico. Reabrir guest
cart requiere un SDD nuevo para cookie, TTL, ownership, merge, concurrencia y
abuso; no se infiere desde #13.

## Cierre honesto

- #8 permanece abierto mientras carrier/emails sigan como resultado de negocio
  solicitado o hasta que el owner recorte expresamente ese alcance.
- #13 permanece abierto hasta registrar en el issue la política CUSTOMER vigente
  y separar formalmente los retornos Mercado Pago live.
- #282 sólo acredita rutas/acciones locales reales; no cierra #8/#13 ni acredita
  carrier, correo transaccional o Mercado Pago live.

## Fuera de alcance

Código runtime, guest cart, polling, editor visual de política, SMTP productivo,
carrier, Correo Argentino, Mercado Pago live, ARCA, deploy y homologación.
