# Sol review — MP-LIVE-02 Orders lifecycle

**Fecha:** 2026-09-22  
**WIP:** `sdd/wip/20260922-storecore-mp-live-checkout-v1/`  
**Alcance:** ADR-001 y anexos de errores/recuperación, identidad de webhook, reversos/stock y modelo físico; contraste con el baseline y los patrones existentes de inbox/refetch.

## Dictamen

**MP-LIVE-02 queda aprobado documentalmente con condiciones de implementación.** El contrato ya es suficientemente cerrado para iniciar MP-LIVE-03 y sus test doubles de MP-LIVE-04 sin credenciales reales. El gate emitido en `20260922-sol-mp-live-03-go.md` es `CONDITIONAL_GO`.

Las condiciones no permiten improvisar comportamiento: conservan deshabilitada la integración, obligan a usar el validador oficial y dejan la evidencia sandbox para MP-LIVE-05. No se autoriza activar pagos, POS/BlackStore, fiscal/ARCA, deploy, secretos ni tráfico live.

## Evidencia revisada

Se leyeron completos ADR-001, los tres anexos nuevos, el modelo físico, specs funcional/técnica, plan, meta, las cuatro reviews Sol previas, `STATUS`, `PROJECT`, `PATTERNS`, `AGENTS` y las migraciones V1–V3. También se contrastaron `OfficialResourceQueryPort`, `UnconfiguredOfficialResourceAdapter`, `PaymentController`, `JdbcPaymentService`, `InboxApplicationWorker`, `WebhookInboxLimiter` y sus pruebas.

El baseline existente confirma por qué MP-LIVE-03 debe crear un carril Orders separado:

- `PaymentController` acepta hoy `/api/v1/payments/mercadopago/notifications` sin firma.
- `JdbcPaymentService` confunde query/body IDs y persiste un inbox V1 no apto para Orders.
- `InboxApplicationWorker.processPayments` consulta el recurso por `provider_event_id`, usa fallback al event ID, aplica por inbox y puede marcar `PAID` antes de demostrar consumo completo.
- `OfficialPaymentResource` no contiene merchant/aplicación, importes, moneda, `status_detail`, order ni transacciones.
- El adapter por defecto sí ofrece el patrón correcto de fail-closed/unconfigured; las tablas V1 ofrecen el patrón de evidencia inmutable y processing mutable, pero no sus identidades ni constraints.

Por tanto, el código legado de pagos no puede reutilizarse como implementación Orders. La rama ML debe preservarse.

## Contrato cerrado y apto para MP-LIVE-03

1. **Producto y autoridad:** Checkout Pro externo por Orders API. El browser y `auto_return=all` sólo sirven UX; nunca prueban pago.
2. **Creación/recovery:** intento durable antes de `POST /v1/orders`; referencia, UUID de idempotencia, request hash y snapshot son inmutables. El POST ocurre fuera de TX. Timeout, respuesta perdida, `423`, `400` de idempotencia y `409` no crean automáticamente otra clave ni otra order: primero search paginado y match único verificado.
3. **Identidades separadas:** `body.id`, query `data.id`, body `data.id`, `providerOrderId`, `providerPaymentId` e IDs de refund/chargeback no son intercambiables. El GET canónico usa exclusivamente el `providerOrderId` vinculado o el candidato firmado de query.
4. **Autenticación:** firma antes de inbox mediante el `WebhookSignatureValidator` oficial, usando `x-signature`, `x-request-id`, query `data.id` y secreto de instalación. Firma inválida: 401 y cero inbox. Está prohibido reconstruir o inventar HMAC.
5. **Durabilidad:** una notificación auténtica se persiste como procesable o cuarentena antes del ACK. Si el commit falla, no hay ACK exitoso. Inbox inmutable y estado/lease separados.
6. **Refetch y aplicación:** lease corto, GET oficial fuera de TX, luego lock y verificación de ID, referencia, `user_id`, `application_id`, importe, moneda y snapshot. Dedupe comercial por `(providerOrderId, transition)` y una sola acreditación por orden local.
7. **Stock tardío:** acreditación financiera y venta despachable son hechos distintos. Sólo `PAID` tras consumo completo; sin stock, `payments=APPROVED` + `PAID_STOCK_REVIEW` + incidente, sin consumo parcial ni evento de venta verificada.
8. **Reversos:** refund/chargeback/fraude crean caso `UNDER_REVIEW`; no restock, RMA, corrección fiscal ni silenciamiento de la acreditación por inferencia.
9. **Modelo:** migración Flyway aditiva posterior a V3; no modificar V1. El conjunto propuesto separa intentos, transacciones, inbox/processing, aplicaciones, business events/outbox, reversos e incidentes y exige constraints DB, no sólo checks de aplicación.
10. **Límites:** instalación single-tenant; no `store_id`, `store_hosts` ni `TenantFilter`. USER y CUSTOMER permanecen separados. POS y fiscal siguen documentales.

## Condiciones vinculantes del CONDITIONAL_GO

Estas condiciones deben satisfacerse en MP-LIVE-03/04 y bloquear merge o activación si fallan:

1. **Fail closed por defecto.** El adapter Orders, creación remota, receptor y worker quedan OFF/unconfigured por defecto. Configuración incompleta, secreto no resoluble, identidad esperada ausente o allowlist vacía no crea tráfico ni acepta aplicación comercial. No usar un booleano/feature flag genérico.
2. **Validador oficial únicamente.** Luna debe fijar la dependencia y API oficial de `WebhookSignatureValidator` y cubrirla mediante un wrapper/port estrecho. No se admite implementación HMAC local, incluso si reproduce ejemplos.
3. **Tópico sin aliases.** Hasta evidencia MP-LIVE-05, aceptar como forma procesable sólo el tópico exacto soportado y configurado por el contrato probado; `order` y `orders_v2` no se normalizan ni se tratan como aliases. Formas desconocidas o discordantes van a cuarentena, sin efectos.
4. **Dedupe provisional conservador.** La migración puede usar la clave documental `UNIQUE(user_id, body_event_id, query_data_id, x_request_id)` y debe persistir además `application_id`, ambos `data.id`, tópico y request ID crudos. Como esa clave aún espera muestra sandbox, la idempotencia comercial por recurso/transición y por orden local es obligatoria y no puede depender sólo del dedupe de entrega.
5. **Allowlist y secretos tipados.** Hosts HTTPS de `checkout_url`, access token, installation secret, `user_id` y `application_id` provienen de configuración tipada/referencia opaca por instalación. No hardcodear host, cuenta, credencial o merchant. El secreto no se persiste en inbox, payload, log o test fixture.
6. **Retiro seguro del carril V1.** Antes de cualquier activación, la URL legada sin firma debe quedar retirada/reemplazada y `processPayments` V1 no debe poder aplicar tráfico MP. Pruebas deben demostrar cero inbox/aplicación por la ruta legada y conservar operativo el carril ML.
7. **Migración verificable.** Crear V4 o la siguiente versión libre, aditiva y con constraints para FK compuesta pago/orden, un intento activo, `provider_order_id`, transición comercial y acreditación única. Incluir `PAID_STOCK_REVIEW` explícito sin reinterpretar IDs V1 ni reescribir histórico.
8. **Transacciones y red.** Ninguna llamada MP ocurre bajo lock/TX DB. Falla técnica revierte la aplicación y deja retry; resultado de negocio sin stock confirma atómicamente el hecho financiero, estado de revisión e incidente.
9. **Cierre de pruebas.** MP-LIVE-04 puede avanzar en el mismo cambio o inmediatamente después con doubles, sin red ni credenciales. Debe cubrir concurrencia, recovery cero/uno/múltiples, firmas/IDs/tópicos, persist-before-ACK, refetch por order, duplicados, dos workers, caída/reanudación, stock tardío y reversos sin restock.
10. **Sin activación por esta review.** La capability permanece `DISABLED` y no se usa browser, sandbox ni credencial real como parte de MP-LIVE-03/04. La suite general roja preexistente debe registrarse por separado; no se aceptan regresiones nuevas en pruebas focalizadas/migración.

## Riesgos residuales no bloqueantes para código

- La muestra sandbox debe confirmar el tópico real y la clave final de dedupe de entrega. Es gate de MP-LIVE-05/activación, no de doubles.
- La lista concreta de hosts MP debe verificarse contra respuesta/documentación del entorno y entrar por configuración aprobada; no se infiere en código.
- `data-model-proposal.md` enumera invariantes, pero el SQL exacto se cierra en MP-LIVE-03 y debe someterse a revisión Sol antes de activar.
- Las specs/plan/meta todavía muestran el NO-GO anterior; Terra debe sincronizar el estado tras este dictamen sin ampliar el alcance.

## Gates antes de MP-LIVE-05

1. Review Sol del código MP-LIVE-03 y evidencia MP-LIVE-04 verde.
2. Cuenta MP real y credenciales sandbox fuera del repo/CI, cargadas por el mecanismo aprobado.
3. Muestras saneadas de webhook que resuelvan `order` versus `orders_v2`, query/body `data.id` y dedupe.
4. E2E de creación, retorno no autoritativo, webhook firmado, persist-before-ACK, GET oficial e idempotencia.
5. Demostración de ruta V1 retirada, adapter inicialmente OFF, observabilidad redactada y procedimiento de rollback/pausa.
6. Nuevo GO Sol explícito para activar sandbox/live. Nada aquí autoriza producción.

## Exclusiones expresas

NO-GO para POS/BlackStore adapter, fiscal/ARCA, emisión/corrección fiscal, live credentials en repo o CI, pago acreditado por browser, HMAC inventado, aliases `order`/`orders_v2`, restock automático por refund/chargeback/`UNDER_REVIEW`, shared runtime multi-tenant o cualquier comportamiento fuera del WIP.
