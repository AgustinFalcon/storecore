VERDICT: CHANGES_REQUIRED

# Sol code review — MP-LIVE-03/04

**Fecha:** 2026-09-22  
**Branch/commit revisado:** `feature/mp-live-02a-pure-policy` / `825dc8a`

## Hallazgos bloqueantes

1. **El carril de creación no está conectado al checkout productivo.** `MpCheckoutAttemptService.prepare`, `postAndBind` y `recover` sólo tienen callers en tests. `CartController` continúa devolviendo el `CheckoutReceipt` local de `JdbcCartService`; no crea el intento MP durable, no ejecuta el POST fuera de TX, no vincula `providerOrderId`/`checkout_url` y no entrega una URL allowlisted para redirección. La implementación aislada no satisface el flujo autorizado por MP-LIVE-03.
2. **El worker no ata la identidad refetched al inbox reclamado.** Hace GET con `query_data_id`, pero `apply` usa `official.providerOrderId` sin comprobar que sea igual al ID reclamado. Un adapter defectuoso o respuesta discordante puede seleccionar y aplicar otro intento conocido que también coincida en cuenta/aplicación/referencia/importe. Debe fallar cerrado ante `official.providerOrderId != claimed queryDataId`, con prueba focalizada.
3. **MP-LIVE-04 no cubre los gates de concurrencia exigidos.** `MpOrdersCheckoutIntegrationTest` tiene cuatro casos secuenciales; no prueba dos workers/claims concurrentes ni acreditaciones remotas concurrentes. En particular, el chequeo `already` ocurre antes de bloquear la orden local y antes del insert único de `PAYMENT_ACCREDITED`; dos intentos distintos pueden decidir acreditar en paralelo y el perdedor termina en conflicto/retry, no en el incidente determinista previsto. Falta prueba concurrente y corrección del orden de locks/idempotencia.
4. **Falta evidencia ejecutable del adapter oficial de firma.** El código sí envuelve directamente `com.mercadopago.webhook.WebhookSignatureValidator` y no implementa HMAC local, pero las pruebas sustituyen el port con un fake. Agregar prueba del wrapper oficial para aceptación/rechazo y fallo cerrado, sin credenciales live.

## Gates que sí cumplen

- Default `adapter: unconfigured`, referencias de secretos por nombre de variable de entorno y configuración incompleta quedan OFF/fail closed.
- `order` y `orders_v2` no se aliasan; tópico/IDs discordantes se cuarentenan.
- Firma válida precede al insert y el inbox/processing se confirma antes del ACK; firma inválida retorna 401 sin inbox.
- El adapter de consulta usa `GET /v1/orders/{providerOrderId}`; no usa `body.id` ni notification ID como fallback.
- V1 MP responde 410 y `processPayments()` no aplica; la rama Mercado Libre y su prueba permanecen.
- `APPROVED + PAID_STOCK_REVIEW` no consume parcialmente ni emite fulfillment; refund/chargeback abre `UNDER_REVIEW` sin restock.
- No se encontraron secretos live, HMAC inventado, DDL/side effects POS ni implementación fiscal.

## Evidencia

Ejecutado:

`mvn -q "-Dtest=MpOrderWebhookPolicyTest,MpOrderCommercialPolicyTest,MpOrdersSchemaTest,MpOrdersCheckoutIntegrationTest,CommerceHttpIntegrationTest,InboxApplicationWorkerTest" test`

Resultado: **PASS**. El verde focalizado no cierra los casos bloqueantes ausentes indicados arriba.

## Gate

Corregir los cuatro puntos y repetir pruebas focalizadas, de migración y concurrencia antes de una nueva revisión Sol. **MP-LIVE-05, sandbox/live, credenciales reales y producción permanecen NO-GO; este review no los autoriza.**
