VERDICT: CONDITIONAL_GO

# Sol gate — MP-LIVE-03/04

**Fecha:** 2026-09-22  
**Base:** `20260922-sol-mp-live-02-review.md`

## Allowed work for MP-LIVE-03

- Implementar el carril server-side Checkout Pro/Orders API separado del payment inbox/worker V1.
- Mantener adapter, creación remota, receptor y worker OFF/unconfigured por defecto y fail closed ante configuración incompleta.
- Crear/reusar el intento durable antes del POST, hacer red fuera de TX, vincular `providerOrderId` y `checkout_url` HTTPS allowlisted antes de redirigir.
- Implementar recovery con la misma clave y search oficial paginado; cero/múltiples/incompleto queda `RECOVERY_REQUIRED`, sin nueva order automática.
- Validar antes de persistir exclusivamente con `WebhookSignatureValidator` oficial (`x-signature`, `x-request-id`, query `data.id`, installation secret).
- Persistir inbox o cuarentena durable antes del ACK; firma inválida retorna 401 sin inbox.
- Hacer GET oficial por `providerOrderId`, nunca por `body.id` ni por ID de notificación, y verificar cuenta/aplicación, referencia, importe, moneda y estado.
- Aplicar idempotentemente por `(providerOrderId, transition)` y acreditar como máximo una vez cada orden local.
- Crear migración Flyway aditiva posterior a V3 con tablas/constraints de intentos, transacciones, inbox/processing, aplicaciones, eventos/outbox, reversos, incidentes y `PAID_STOCK_REVIEW`.
- Retirar/reemplazar la ruta MP V1 sin firma y deshabilitar su rama de aplicación, preservando el worker Mercado Libre.

## Allowed work for MP-LIVE-04

**Sí.** Se autorizan doubles deterministas y pruebas unitarias, de integración y migración sin red ni credenciales live. Deben cubrir firma/forma/IDs, tópico exacto sin aliases, persist-before-ACK, recovery, concurrencia, refetch por order, duplicados, dos workers, stock tardío, refund/chargeback en `UNDER_REVIEW`, ruta V1 cerrada y ML preservado.

## Condiciones del GO

1. No implementar HMAC local: fijar y envolver la API oficial `WebhookSignatureValidator`.
2. `order` y `orders_v2` permanecen valores distintos; desconocido/discordante se cuarentena.
3. Persistir `user_id`, `application_id`, `body_event_id`, query/body `data.id`, tópico y `x-request-id`; usar el dedupe conservador propuesto y respaldarlo con idempotencia comercial independiente.
4. Allowlist, expected IDs y referencias de secretos son configuración tipada; defaults ausentes significan OFF.
5. No hay llamada remota bajo lock/TX. No hay consumo parcial; falta de stock confirma `APPROVED` + `PAID_STOCK_REVIEW` + incidente.
6. Antes de merge, pruebas focalizadas y de migración verdes, sin regresión nueva; el SQL exacto conserva V1–V3 e histórico.
7. Esta autorización permite código y doubles, no activación sandbox/live.

## Explicitly forbidden

- Credenciales, access tokens o installation secrets live en repo, fixtures, logs o CI.
- POS/BlackStore adapter, tablas o side effects; fiscal/ARCA, emisión o corrección fiscal.
- Usar browser, return URL o `auto_return` como prueba de pago.
- HMAC inventado o reconstruido en StoreCore.
- Tratar `order` y `orders_v2` como aliases sin evidencia sandbox.
- Usar `body.id`, body `data.id` o notification ID como resource/order ID por fallback.
- Restock automático ante refund, chargeback, fraude o cualquier caso `UNDER_REVIEW`.
- Marcar `PAID` con consumo parcial o stock no confirmado.
- Crear una nueva clave/order automática ante timeout, idempotency error o search ambiguo.
- `store_id`, `store_hosts`, `TenantFilter`, shared runtime o mezcla USER/CUSTOMER.

## Remaining gates before MP-LIVE-05

1. Review Sol del código MP-LIVE-03 y evidencia completa MP-LIVE-04.
2. Cuenta MP real y credenciales sandbox gestionadas fuera del repo/CI.
3. Muestras saneadas que cierren tópico `order`/`orders_v2`, query/body `data.id` y dedupe final.
4. E2E sandbox de POST/recovery, retorno no autoritativo, firma oficial, inbox antes de ACK, GET oficial e idempotencia.
5. Evidencia de ruta/worker V1 MP cerrados, ML intacto, logs redactados, adapter OFF por defecto y rollback/pausa.
6. GO Sol separado para activar sandbox o live; MP-LIVE-05 y producción continúan NO-GO hasta entonces.
