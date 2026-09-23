# Addendum técnico — propuestas condicionadas para pago y fiscal

**Fecha:** 2026-09-22  
**Estado:** `documented_deferred`; propuesta de diseño. No autoriza código, DDL, workers, secretos, homologación ni emisión.

**Nota 2026-09-23:** MP-LIVE-01–04 fail-closed ya están en `master`. Este addendum no los reabre, no cierra D-07 ni habilita emisión. Las filas de la tabla siguen Open.

## Hechos de partida

El checkout vigente crea una orden y pago locales pendientes; no crea una preferencia, orden ni otro recurso de Mercado Pago. `JdbcPaymentService` sólo deja durable el inbox y devuelve `applied=false`; no aplica el pago por sí mismo. `InboxApplicationWorker` aplica localmente las entradas con un fake, mientras que el adapter predeterminado `UnconfiguredOfficialResourceAdapter` declara `configured=false`. `OfficialPaymentResource` sólo aporta `id`, `externalReference` y `status`, y `findPayment` admite fallback a `eventId`: no verifica cuenta, importe, moneda ni referencia de una fuente remota. `buyer_snapshot` es inmutable como evidencia comercial, pero no contiene tipo/número de documento ni condición IVA y sigue siendo insuficiente como snapshot fiscal. En consecuencia, ningún redirect, mensaje entrante, aplicación local fake o estado pendiente habilita una intención fiscal.

La definición concreta depende del producto Mercado Pago elegido en D-07. No se presupone una firma HMAC universal: autenticación del mensaje, recurso canónico, refetch, estados finales, referencia externa y transición desde el checkout se adoptarán desde la documentación oficial vigente de ese producto. Para Checkout Pro, la documentación vigente identifica la preferencia como objeto central y prevé consultar el pago luego de notificación o retorno; esto no selecciona Checkout Pro por sí solo.

ARCA informa que los monotributistas emiten comprobantes electrónicos C a consumidores finales y requieren un punto de venta habilitado para el método de facturación. La categoría baja no elimina ese requisito. La matriz del emisor, el servicio, la fecha/trigger y los rectificativos siguen pendientes de D-02 a D-06.

## Propuestas sin cierre

| Gate | Propuesta condicionada | Ownership propuesto | Estado |
| --- | --- | --- | --- |
| D-01 | La biblioteca `arca-facturacion` conserva protocolos ARCA y modelos fiscales. El adaptador StoreCore es dueño de política, snapshot, persistencia, outbox fiscal, worker, reserva y auditoría. Pagos conserva inbox, validación contra proveedor y aplicación comercial. Ningún módulo reemplaza el ownership del otro. | Plataforma, con revisión Sol | Open |
| D-07 | Tras seleccionar el producto MP, crear el checkout remoto y un adapter HTTP específico. El validador persiste primero la notificación, obtiene el recurso canónico oficial y correlaciona una referencia externa con exactamente un pago/orden local. La aplicación comercial idempotente sólo genera un `VerifiedBusinessEvent` después de comprobar cuenta, estado, importe, moneda, referencia y transiciones definidos por el contrato aprobado. El fake y el adapter sin configurar no satisfacen esta decisión. | Plataforma | Open |
| SC-02 | Persistir identidades separadas: `providerNotificationId`, `providerPaymentOrOrderId`, `paymentApplicationId`, `fiscalEligibilityKey`, `fiscalIntentId`, `fiscalOutboxId`, `workerOperationKey`, `arcaCorrelationId` y `documentId`. Cada clave tiene dominio, versión y constraint propios; no se reutiliza el ID de notificación como ID de pago, intención, outbox ni correlación ARCA. Las fórmulas incluyen los componentes aprobados por D-02/D-04/D-05/D-07, nunca tarjeta, token, certificado ni payload completo. | Plataforma | Open |
| SC-03 | Antes de despachar se toma un lane lock durable por `(issuerProfileId, environment, salesPoint, voucherType)` y una reserva exacta por `(issuerProfileId, environment, salesPoint, voucherType, voucherNumber, draftHash, fencingToken)`. Ambas registran owner, vencimiento y recuperación comprobable. Cada despacho y escritura de estado comprueba el fencing vigente. Un timeout posterior al envío conserva la reserva y pasa a conciliación; no se reasigna ni reintenta hasta que SC-03 y la política permitan una salida segura. | Plataforma | Open |
| SC-07 | Crear un outbox fiscal separado, dueño de las transiciones de intención fiscal y con payload mínimo/redactado. La transacción que crea `FiscalIntent` inserta exactamente un `FiscalOutboxMessage`. La aplicación de pago y la decisión de elegibilidad definen, en un diseño aprobado, cómo preservar atomicidad: o una única transacción que contiene aplicación comercial, decisión, intención y outbox fiscal, o una secuencia durable con una frontera explícita y reanudable. `integration_outbox` actual permanece de Mercado Pago y no se reutiliza por inferencia. | Plataforma, con GO Sol | Open |

## Flujo propuesto

```text
notificación MP durable
  → validación + refetch HTTP del producto elegido (D-07)
  → aplicación comercial idempotente
  → VerifiedBusinessEvent
  → FiscalEligibilityPolicy versionada (D-03/D-05)
  → [misma atomicidad aprobada] FiscalIntent inmutable + FiscalOutboxMessage separado
  → reserva con fencing (SC-03)
  → worker fiscal → adapter ARCA (D-04)
  → autorizado | rechazo en revisión | incertidumbre y conciliación
```

El snapshot fiscal se forma sólo al crear la intención y contiene los datos que D-03/D-05 aprueben, incluidos documento y condición IVA cuando correspondan. No se completa leyendo después el pedido, la dirección, el perfil, el catálogo ni el `buyer_snapshot` comercial inmutable pero insuficiente. Una autorización queda inmutable; refund, chargeback y devolución usan la política D-06 y, si corresponde, un documento rectificativo vinculado al original.

## Criterios para cerrar las propuestas

- D-01: ADR revisado que enumere ownership y límites de datos entre pagos, StoreCore fiscal y la biblioteca externa.
- D-07: producto MP, checkout remoto, documentación fechada, contrato de notificación, adapter HTTP/refetch, verificación de cuenta/importe/moneda/referencia, correlaciones y transiciones de aplicación probadas contra ese producto.
- SC-02: fórmulas, constraints y casos de repetición, parcialidad y concurrencia revisados.
- SC-03: lane lock y reserva exacta con fencing, crash recovery y pruebas de dos workers, timeout y conciliación.
- SC-07: modelo de transacción, ownership de cada outbox y prueba de caída que demuestre que no se pierde ni duplica la intención fiscal.

Todos los gates de esta propuesta permanecen **Open**. Requiere además D-02 a D-06, SC-01 y SC-04 a SC-06, matriz aprobada por titular/contador, manual ARCA fechado y GO específico de Sol antes de abrir trabajo implementable.
