# Modelo físico propuesto — Checkout Pro/Orders

**Estado:** propuesta SDD, sin DDL ejecutable ni migración aplicada. Requiere ADR-001 y Sol GO.  
**Base:** PostgreSQL single-tenant por instalación; migración aditiva posterior a la última versión Flyway vigente. No modificar `V1__core_single_tenant_schema.sql` ni reinterpretar sus IDs V1 como IDs de Orders API.

| Entidad propuesta | Campos y constraints obligatorios para revisión |
| --- | --- |
| `mp_checkout_attempts` | `id`, `order_id` FK, `payment_id` del agregado local, `attempt_no`, `external_reference VARCHAR(64) UNIQUE`, `idempotency_key UUID UNIQUE`, `request_hash CHAR(64)`, monto/moneda y snapshot inmutables, `provider_order_id VARCHAR(128) UNIQUE NULL`, `checkout_url` validada NULL, `state`, error saneado y timestamps. **FK compuesta `(payment_id,order_id)` → `payments(id,order_id)`**, con índice/clave única referenciable en `payments`; impide asociar un pago de otra orden. `UNIQUE(order_id,attempt_no)`. Índice único parcial por `order_id` para estados activos, más lock transaccional de la orden local para no iniciar un intento si ya está pagada. |
| `mp_order_payment_transactions` | `attempt_id` FK, `provider_payment_id VARCHAR(128) UNIQUE`, `provider_order_id`, estado/detalle, monto total/pagado, tipo de medio de pago y timestamps; sin PAN, CVV ni token de tarjeta. Conserva cada transacción de cada intento, incluso si no existe refund/chargeback. Su intento determina inequívocamente orden local y agregado de pago. |
| `mp_order_notification_inbox` | Registro inmutable de entrega validada: `id`, `body_event_id`, `raw_topic`, `query_data_id`, `body_data_id`, `provider_order_id_candidate`, `x_request_id`, versión/resultado de firma, envelope redactado, recepción y disposición `PROCESSABLE/QUARANTINED`. Definir la clave de dedupe exacta tras muestra oficial; no igualar `body_event_id` con `query_data_id`. |
| `mp_order_notification_processing` | PK/FK a inbox, `status`, lease, intentos, disponibilidad de reintento y diagnóstico saneado. Sólo esta tabla es mutable; el inbox conserva evidencia. |
| `mp_order_commercial_applications` | `id`, `inbox_id` FK, `attempt_id` FK, `order_id` FK, `provider_order_id`, `transition`, monto/moneda confirmados, `applied_at`; `UNIQUE(provider_order_id,transition)` y unicidad de acreditación por `order_id` para `PAYMENT_ACCREDITED`. La segunda order MP acreditada es incidente, no segunda aplicación. |
| `mp_verified_business_events` | Evento comercial durable con `application_id UNIQUE`, `event_key UUID UNIQUE`, tipo, payload mínimo redactado y fecha. No contiene instrucción fiscal ni dato de emisor. |
| `mp_order_outbox` y delivery | Outbox basado en `business_event_id UNIQUE`, `idempotency_key UUID UNIQUE`, tipo/payload mínimo y registro de entrega con lease/reintentos. Su unicidad no depende de `source_inbox_id`: distintos webhooks de la misma acreditación no duplican evento. |
| `mp_order_reversal_cases` | `attempt_id`/`provider_order_id`, IDs independientes de pago/refund/chargeback según el caso, `kind`, estado de revisión, referencia de inbox, evidencia mínima y timestamps. Unicidad por identidad financiera + tipo; nunca FK/trigger de restock automático. |
| `mp_order_incidents` | `attempt_id`, `order_id`, tipo `DUPLICATE_REMOTE_CREDIT`, `PAID_WITHOUT_STOCK` u otra discrepancia aprobada, estado de revisión, evidencia redacted, owner admin y timestamps. Un incidente financiero no crea segunda venta; uno de stock bloquea fulfillment y no genera evento de venta verificada. |

## Estados y unicidad

`mp_checkout_attempts`: `CREATED`, `POSTING`, `RECOVERY_REQUIRED`, `READY_FOR_REDIRECT`, `AWAITING_RESULT`, `TERMINAL_UNPAID`, `ACCREDITED`, `QUARANTINED`, `SUPERSEDED`. El índice de un intento activo incluye al menos `CREATED`, `POSTING`, `RECOVERY_REQUIRED`, `READY_FOR_REDIRECT`, `AWAITING_RESULT`, `QUARANTINED`. `TERMINAL_UNPAID` sólo se alcanza con cierre remoto verificado, no por timeout local; `SUPERSEDED` no puede ocultar un cargo posterior. La orden local `PAID` impide cualquier nuevo intento aunque el anterior haya salido del índice activo.

`mp_order_notification_processing`: `RECEIVED`, `PROCESSING`, `RETRYABLE`, `PROCESSED`, `QUARANTINED`, `FAILED`. Una notificación auténtica pero discordante se conserva y alerta; no se marca como pago aplicado. Una firma inválida no se acepta como notificación procesable.

`mp_order_reversal_cases`: `OPEN`, `UNDER_REVIEW`, `RESOLVED`, `REJECTED`. El caso es evidencia/operación administrativa, no una transición automática de pedido ni inventario. El estado de order local ante refund/chargeback y cualquier corrección fiscal siguen decisión separada.

La migración posterior debe añadir un estado explícito de orden local `PAID_STOCK_REVIEW` (nombre final sujeto a Sol): pago acreditado pero reserva consumida incompleta o vencida sin re-reserva posible. `payments.status=APPROVED` refleja el hecho financiero; la orden no pasa a `PAID` ni habilita fulfillment. Si la reserva venció, la re-reserva usa nuevas claves de saga/línea y verifica todo el stock antes de consumir; no reutiliza `JdbcInventoryService.reserve` sobre claves que ya apuntan a una reserva `EXPIRED`. El número y cantidades de líneas consumidas debe coincidir exactamente con el snapshot del pedido. **Stock insuficiente es un resultado de negocio esperado**, no una excepción que revierta toda la aplicación: confirmar atómicamente pago `APPROVED`, orden `PAID_STOCK_REVIEW` e incidente admin, sin consumo parcial. Una falla técnica/transitoria sí revierte la transacción y se reintenta tras nuevo refetch; no se confirma aplicación ni se pierde el mensaje. La política fiscal de este estado sigue abierta.

## Compatibilidad y migración

- `payments.provider_payment_id` V1 no es `provider_order_id`; el ID de order se guarda sólo en el nuevo intento. Si múltiples intentos comparten el pago local, sus IDs de transacción quedan en `mp_order_payment_transactions`, no se sobreescribe un único `provider_payment_id` como si fuera la order.
- `payment_event_inbox.provider_event_id` y `resource_reference` V1, `payment_event_applications` por `inbox_id`, e `integration_outbox` por `source_inbox_id` no satisfacen dedupe comercial de Orders. El carril nuevo debe rutearse explícitamente al inbox/worker nuevo; el worker V1 no consume Orders.
- El endpoint legado `POST /api/v1/payments/mercadopago/notifications` está mapeado hoy por `PaymentController` y acepta query/body sin firma; `JdbcPaymentService` lo ingresa al inbox y la rama payment de `InboxApplicationWorker` puede aplicar. **Antes de activar `PAYMENTS_MP`**, retirar esa ruta o reemplazarla por un receptor Orders que valide firma antes del inbox; deshabilitar/eliminar también la rama payment del worker legado (preservar la rama ML). No basta con configurar el webhook nuevo en MP ni con confiar en la capability compartida `PROCESS_WEBHOOK`. Pruebas deben demostrar que la URL legada no aplica pagos ni inserta inbox y que sólo el receptor nuevo procesa notificaciones firmadas.
- Hasta aprobar la migración, mantener `PAYMENTS_MP` sin tráfico real. No abrir un flag genérico; la activación posterior requiere configuración tipada, capability `ACTIVE`, kill switch acotado, muestras de webhook, E2E y cierre verificable del endpoint/worker legado.
- Secuencia de migración: crear entidades aditivas y constraints → probar invariantes con datos V1 preservados → desplegar adapter nuevo deshabilitado → verificar sandbox → Sol GO de activación. Ninguna etapa infiere pagos antiguos ni reescribe histórico.

## Pruebas del modelo previas al GO

1. Dos requests simultáneos del mismo checkout reclaman el mismo intento; otro intento activo falla por constraint, no sólo por lógica de aplicación.
2. Respuesta de POST perdida y commit local fallido recuperan como máximo una order; cero/múltiples resultados quedan sin redirección.
3. Dos provider Orders acreditadas para una orden local insertan una sola aplicación/evento/outbox y un incidente financiero durable.
4. Dos workers, notificaciones repetidas o fuera de orden no duplican consumo ni outbox.
5. Refund/chargeback generan caso visible sin restock ni corrección fiscal automática.
6. Un intento no puede referir `payment_id` de otra orden (FK compuesta); la URL legada y el worker de pagos V1 no aceptan ni aplican tráfico al activar Orders, mientras ML sigue operativo.
7. Pago MP acreditado tras 30 minutos o scheduler de expiración: sin stock no queda `PAID` ni se despacha; con stock revalidado se consume completo una sola vez; un conteo parcial de `consumeSaga` jamás se toma como éxito.

El esquema SQL exacto, índice de dedupe del webhook, ventanas de búsqueda, política de reversos y compatibilidad con migraciones existentes permanecen abiertos en MP-LIVE-02/03; este archivo no autoriza crear tablas.
