VERDICT: APPROVED

# Grok review A — PR #16 backend, security, contracts

**Fecha:** 2026-09-23  
**PR:** [#16](https://github.com/AgustinFalcon/storecore/pull/16) `feature/mp-live-02a-pure-policy` @ `695f7190cd4ca512778af829209a22f823abc813`  
**Base:** `origin/master`  
**Alcance:** diff `origin/master...HEAD` (67 files). No incluye el worktree sucio (AGENTS.md local, precios JDBC sin trackear, docs/agent, close-out Sol sin commit).  
**Rol:** Reviewer A. No merge. No cambio de código de producción.

## Why

El carril es Checkout Pro externo en la misma ventana, vía Orders API, para una instalación single-tenant. El navegador puede recibir un `checkout_url` HTTPS allowlisted después de un intento durable; ese redirect no acredita. La acreditación exige firma oficial, inbox durable antes del ACK, GET por `providerOrderId` (el `data.id` de query reclamado) y una sola aplicación comercial por orden local. `PAYMENTS_MP` sigue siendo capability tipada (`CLAIM_CHECKOUT`, `PROCESS_WEBHOOK`, `APPLY_EVENT`), no un flag genérico. El default es adapter `unconfigured` y el módulo queda apagado hasta activación. MP-LIVE-05, credenciales live, POS/BlackStore y fiscal siguen NO-GO. Esta aprobación no autoriza merge, sandbox, tag, deploy ni publish.

## Validaciones

Ejecuté en `backend/` (exit 0, ~64 s, PostgreSQL 16 vía Testcontainers, Flyway V1–V4 aplicadas en los contextos que migran):

`mvn -q "-Dtest=MpCheckoutAttemptPolicyTest,MpOrderWebhookPolicyTest,MpOrderCommercialPolicyTest,MpOrdersSchemaTest,MpOrdersCheckoutIntegrationTest,OfficialWebhookSignatureAdapterTest,CommerceHttpIntegrationTest,InboxApplicationWorkerTest" test`

GitHub Actions run `35796233805`: jobs `backend` y `frontend` en `failure` en ~2 s, sin steps. No los trato como suite roja ni como CI verde. Encaja con el fallo de arranque por billing/spending limit ya declarado en el PR y en `20260923-sol-mp-live-closeout-go.md`. No reejecuté la suite Angular; leí mapper, use case y `CartStore`.

`.cursor/rules/my-backend-standards.mdc` no está en el repo. Apliqué `AGENTS.md`, `sdd/PATTERNS.md` y el contrato del WIP (ADR-001, webhook, matriz, reversos).

## Hallazgos

### Bloqueantes

Ninguno.

### Nits (no piden cambio antes de este dictamen)

1. `JdbcCartService.withRemoteCheckout` traga cualquier fallo con `runCatching { }.getOrNull()`. Sin URL allowlisted el receipt sigue `PENDING` / `PENDING_PAYMENT` y no hay redirect. No acredita. El motivo saneado no llega al cliente.
2. `two remotes and concurrent workers` lanza dos hilos, pero `MpOrderApplicationWorker.process` reclama hasta 20 filas con `SKIP LOCKED`. Un hilo puede llevarse ambos inbox y el otro cero. El control real está en el código: `SELECT orders … FOR UPDATE` antes del chequeo de `PAYMENT_ACCREDITED`, más el índice único parcial `ux_mp_order_accredited_once`. El test igual exige una sola aplicación y un `DUPLICATE_REMOTE_CREDIT`.
3. `OfficialOrderApiAdapter.create` manda un POST mínimo (`type`, `processing_mode`, `external_reference`, `total_amount`) sin ítems, moneda ni callback. Con adapter `official` eso es deuda de activación (MP-LIVE-05). Un no-2xx cae en recovery y no redirige. No pedí completarlo: armar el payload live es activación, y el default no llega a ese bean.
4. Un `423` se clasifica `RESOURCE_LOCKED` y pasa a `RECOVERY_REQUIRED` sin la espera/reintento de la misma clave que describe la matriz. `startForLocalOrder` no llama `recover()`. El intento activo bloquea una clave nueva. Fail-closed.
5. Si falta el query `type`, el inbox usa el `type` del body antes de clasificar. No trata `order` y `orders_v2` como aliases: el topic aceptado es un valor configurado y la discordancia se cuarentena. Un query ausente debería cuarentenarse sin heredar el body; no abre acreditación sin firma.
6. `JdbcOrderService.ship` rechaza `PAID_STOCK_REVIEW` y no consulta `mp_order_reversal_cases`. Un chargeback/refund deja `UNDER_REVIEW` y no hace restock; un USER puede igual despachar una orden `PAID`. La política escrita pide frenar despacho irreversible. El gate que Sol cerró es el caso `UNDER_REVIEW` sin restock, y el test de stock review cubre el 400 de fulfillment. No es prueba de cobro ni restock automático. Residual, no bloqueante de este PR.
7. El frontend hace `window.location.assign` sólo si `checkoutUrl` empieza con `https://`. La allowlist de host está en el server. El receipt de ese camino conserva pago `PENDING`. El use case no marca el redirect como cobro.

## Brecha contra las reviews Sol

| Gate de `20260922-sol-mp-live-03-code-review.md` | Estado en `695f719` |
| --- | --- |
| Checkout productivo desconectado | Cerrado. `JdbcCartService` (alta, replay e idempotencia en carrera) llama `MpCheckoutAttemptService.startForLocalOrder` vía `ObjectProvider`. Prepara el intento en TX, POST fuera de TX, ata `providerOrderId` y URL HTTPS allowlisted, y la expone en `CheckoutReceipt.checkoutUrl`. Con adapter distinto de `official`/`fake` el bean no existe y el checkout local no gana URL. `MpOrdersCheckoutIntegrationTest` ve la URL allowlisted en el HTTP de checkout. |
| Refetch sin atar el ID reclamado | Cerrado. El worker hace GET con `query_data_id` y exige `official.providerOrderId == claimedQueryDataId` antes y dentro de `apply`. Si no, `QUARANTINED` / `REFETCHED_ORDER_ID_MISMATCH` y el pago queda `PENDING`. Hay test. |
| Concurrencia sin locks ni prueba | Cerrado en código. Lock de la orden local antes del “ya acreditado”; índice `ux_mp_order_accredited_once`; el perdedor registra `DUPLICATE_REMOTE_CREDIT` en vez de una segunda venta. Hay test de dos orders remotas y dos `process()` concurrentes. Ver nit 2 sobre la fuerza de esa prueba. |
| Wrapper oficial sin test | Cerrado. Producción llama `com.mercadopago.webhook.WebhookSignatureValidator.validate` y resuelve el secreto por nombre de env (`^[A-Z][A-Z0-9_]{0,127}$`). `OfficialWebhookSignatureAdapterTest` cubre aceptación, rechazo y fail-closed. El `HmacSHA256` está sólo en el fixture de test que arma el manifest del SDK. |
| Default fail-closed | Cerrado. `application.yml` deja `adapter: unconfigured`, topic/IDs/hosts/refs vacíos. `Unconfigured*` rechaza firma y no crea/busca/GET. El controller, el worker y el servicio de intentos existen sólo con `official` o `fake`. Firma inválida o adapter no listo → 401 y cero inbox. ACK recién después del commit. V1 `POST /api/v1/payments/mercadopago/notifications` → 410 y no inserta `payment_event_inbox`. `processPayments()` devuelve 0 y el tick ya no lo llama. Mercado Libre sigue en `processMercadoLibre()` y su test pasa. |

`20260922-sol-mp-live-03-go.md` y `20260922-sol-remaining-plan-go.md` siguen vigentes: este dictamen no abre MP-LIVE-05, POS ni fiscal. `20260922-sol-mp-live-03-code-rereview.md` había aprobado el mismo cierre; lo revalidé en el diff y en los tests locales, no por cita. `20260923-sol-mp-live-closeout-go.md` condiciona el merge a approve humano ajeno y a no presentar CI como verde. Este archivo no es ese approve ni un merge.

## Barras que se sostienen

- Sin credenciales live, access tokens ni installation secrets en repo, fixtures de producción o `application.yml`.
- Sin HMAC de producción. Sin alias `order`/`orders_v2` en el carril Orders. `body.id` se persiste como `body_event_id`. El candidato y el GET usan `query_data_id`. El CHECK `provider_order_id_candidate = query_data_id` impide el fallback.
- Sin `store_id`, `store_hosts`, `TenantFilter`. Checkout es CUSTOMER; despacho/RMA es USER. Sin adapter, DDL ni side effect POS/BlackStore. Sin fiscal/ARCA.
- `processed/accredited` con importe distinto no acredita. Stock incompleto → `APPROVED` + `PAID_STOCK_REVIEW` + incidente, sin evento de fulfillment y sin consumo parcial. Refund/chargeback/fraude → `UNDER_REVIEW`, sin restock.
- Dominio sin Spring ni SDK de Mercado Pago. La capability se decide por acción allowlisted; estado distinto de `ACTIVE`, config inválida o kill switch tiran antes del efecto.

No hay archivos que Luna deba cambiar para este veredicto.
