VERDICT: APPROVED

# Sol code re-review — MP-LIVE-03/04

**Fecha:** 2026-09-22  
**Branch/commit revisado:** `feature/mp-live-02a-pure-policy` / `d6b694f`

## Cierre de los cuatro bloqueantes

1. **Checkout productivo: cerrado.** `JdbcCartService.withRemoteCheckout` llama a `MpCheckoutAttemptService.startForLocalOrder` para checkout nuevo y replay. El servicio prepara el intento durable, ejecuta el POST fuera de la transacción de preparación, vincula `providerOrderId` y una `checkout_url` HTTPS allowlisted, y la expone como `CheckoutReceipt.checkoutUrl`. Angular sólo hace `window.location.assign` en la misma ventana para una URL HTTPS; el receipt conserva `PENDING/PENDING_PAYMENT` y el retorno/browser no participa de acreditación.
2. **Bind del ID refetched: cerrado.** El worker consulta por el `queryDataId` reclamado y exige igualdad exacta con `official.providerOrderId` antes y dentro de la transacción de aplicación. La discordancia queda `QUARANTINED` con `REFETCHED_ORDER_ID_MISMATCH`, sin aplicación comercial.
3. **Acreditación concurrente: cerrado.** `accredit` bloquea la orden local `FOR UPDATE` antes del chequeo de acreditación previa. Se conserva el índice único parcial `ux_mp_order_accredited_once`; una segunda Order remota acreditada registra `DUPLICATE_REMOTE_CREDIT`. La integración incluye dos Orders remotas y dos ejecuciones concurrentes del worker, y verifica una sola aplicación/acreditación y un incidente.
4. **Wrapper oficial de firma: cerrado.** Producción delega exclusivamente en `com.mercadopago.webhook.WebhookSignatureValidator`; el secreto se resuelve mediante `InstallationSecretLookup`. `OfficialWebhookSignatureAdapterTest` cubre aceptación, rechazo y fail-closed sin credenciales live. La construcción HMAC existe sólo en el fixture de test que genera el manifest aceptado por el SDK oficial.

## Invariantes revalidados

- Default `adapter: unconfigured`; identidad, hosts y referencias de secretos vacíos; adapters y workers quedan OFF/fail-closed.
- No hay HMAC de producción, credenciales live, POS/BlackStore, fiscal/ARCA ni tenancy SaaS en el cambio.
- `order` y `orders_v2` no se aliasan; topic discordante se cuarentena. `body.id` no se usa como ID de recurso.
- La ruta MP V1 permanece retirada con HTTP 410 y `processPayments()` no aplica; Mercado Libre permanece operativo y probado.
- `PAYMENTS_MP` sigue siendo capability tipada con acciones allowlisted, no un feature flag genérico.

## Evidencia ejecutada

- Backend focalizado: `MpOrderWebhookPolicyTest`, `MpOrderCommercialPolicyTest`, `MpOrdersSchemaTest`, `MpOrdersCheckoutIntegrationTest`, `OfficialWebhookSignatureAdapterTest`, `CommerceHttpIntegrationTest` e `InboxApplicationWorkerTest`: **PASS**.
- Migraciones V1–V4 sobre PostgreSQL 16: **PASS**.
- Frontend focalizado (`http-mappers` y `CheckoutCartUseCase`): **6/6 PASS**.

## Gate

Los cuatro bloqueantes de `20260922-sol-mp-live-03-code-review.md` están cerrados. Esta aprobación se limita al código fail-closed y las pruebas de MP-LIVE-03/04. **No autoriza MP-LIVE-05, sandbox, credenciales live, activación de pagos, merge, deploy, tag ni publish.**
