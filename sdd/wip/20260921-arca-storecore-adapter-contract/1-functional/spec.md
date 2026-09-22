# Especificación funcional — contrato fiscal StoreCore

**Estado:** `documented_deferred` · **Fecha:** 2026-09-21

## Propósito y límite

Definir cómo una instalación StoreCore podría consumir la biblioteca externa de facturación sin mezclar estados comerciales, pagos y autorización fiscal. No define todavía cuándo existe obligación de emitir: esa política depende de D-03/D-05 y la aprueban titular y contador.

## Principios obligatorios

- Un redirect, `back_url`, webhook, job o pago aprobado **no emite por sí mismo**.
- Sólo una `FiscalEligibilityPolicy` versionada puede declarar elegible una operación durable.
- La intención fiscal es un snapshot inmutable; no se reconstruye desde el pedido, catálogo, precio o perfil mutable luego de la emisión.
- Una factura autorizada es inmutable. Refund, chargeback o cambio comercial no la editan; una eventual NC/ND requiere D-06 y vínculo explícito al original.
- StoreCore no usa `store_id`: cada instalación representa un solo merchant. El mapeo fiscal de emisor/perfil queda pendiente de D-02; cuando esté aprobado, los identificadores se delimitarán por instalación, emisor/perfil, proveedor y punto de venta cuando corresponda.
- Una pantalla de checkout no puede fijar “Factura A” para consumidor final. El selector muestra sólo combinaciones habilitadas por la política fiscal del emisor; en desarrollo usa una política DEMO, nunca un perfil real.

## Flujo propuesto, pendiente de activación

```text
Evento de pago/negocio recibido
  → persistencia durable y validación oficial del proveedor
  → FiscalEligibilityPolicy versionada
  → transacción: intención fiscal inmutable + outbox
  → worker fiscal (sólo registros confirmados)
  → biblioteca arca-facturacion
  → autorizado | rechazado | incierto/reconciliación
```

El evento entrante se autentica, persiste y se valida contra el proveedor con la credencial de la instalación antes de producir efectos. Para Mercado Pago, la política D-07 decidirá si el origen canónico es la API actual de Orders, otro recurso oficialmente soportado o una transición; no se reutiliza por inferencia la semántica histórica de preferencias.

## Identidades e idempotencia

La implementación futura debe guardar y distinguir, sin reemplazarlos entre sí:

| Identidad | Propósito |
| --- | --- |
| `providerNotificationId` | Dedupe del mensaje de un proveedor de pago. |
| `providerPaymentOrOrderId` | Referencia externa verificada y correlacionada con una operación StoreCore. |
| `fiscalEligibilityKey` | Identidad versionada de la decisión de volver una operación elegible. |
| `fiscalIntentId` | Identidad interna de un snapshot fiscal inmutable. |
| `workerOperationKey` | Dedupe de la ejecución asíncrona. |
| `arcaCorrelationId` | Correlación de solicitud, respuesta y conciliación con ARCA. |

Las fórmulas exactas, restricciones únicas y la política ante dos pagos parciales se definen después de D-04/D-05/D-07. Ningún identificador se deriva de datos de tarjeta, certificado, token ni contenido completo de una notificación.

## Estados de intención

```text
NOT_ELIGIBLE → ELIGIBLE_PERSISTED → DISPATCH_QUEUED → DISPATCHING
                                                  ├→ AUTHORIZED
                                                  ├→ REJECTED_REVIEW
                                                  ├→ RETRY_SCHEDULED
                                                  └→ UNKNOWN_RECONCILIATION
                                                        ├→ AUTHORIZED
                                                        ├→ ABSENT_CONFIRMED
                                                        └→ MANUAL_REVIEW
```

La transición a `ELIGIBLE_PERSISTED` crea la intención y su outbox en la misma transacción. El worker nunca consume una intención no confirmada. `UNKNOWN_RECONCILIATION` prohíbe una nueva emisión hasta consultar el comprobante exacto con los datos disponibles.

### Tabla de transición obligatoria

| Desde | Actor | Precondición | Hacia |
| --- | --- | --- | --- |
| `NOT_ELIGIBLE` | política versionada | evento durable y validado | `ELIGIBLE_PERSISTED` + outbox atómico |
| `ELIGIBLE_PERSISTED` | transacción | outbox confirmado | `DISPATCH_QUEUED` |
| `DISPATCH_QUEUED` | worker | misma intención/claves y lock/fencing vigente | `DISPATCHING` |
| `DISPATCHING` | adapter | respuesta autorizada | `AUTHORIZED` |
| `DISPATCHING` | adapter | rechazo fiscal | `REJECTED_REVIEW` |
| `DISPATCHING` | adapter | fallo probado antes de enviar | `RETRY_SCHEDULED` |
| `DISPATCHING` | adapter | duda después de despacho | `UNKNOWN_RECONCILIATION` |
| `UNKNOWN_RECONCILIATION` | conciliador | comprobante exacto hallado | `AUTHORIZED` |
| `UNKNOWN_RECONCILIATION` | conciliador | ausencia demostrable + política/lease vigentes | `RETRY_SCHEDULED` de la **misma** intención |
| `UNKNOWN_RECONCILIATION` | conciliador | evidencia inconclusa/no automatizable | `MANUAL_REVIEW` |
| `RETRY_SCHEDULED` | worker | backoff vencido + mismas claves/reserva verificable | `DISPATCHING` |

`AUTHORIZED`, `REJECTED_REVIEW` y `MANUAL_REVIEW` son terminales. Antes de despacho sólo una política explícita puede invalidar una intención; tras despacho no se invalida ni crea otra para el mismo snapshot.

## Datos que deberán preservarse

El `FiscalIntentSnapshot` canónico incluye política/version/hash; identidad y condición fiscal de emisor/receptor; tipo/documento; concepto/períodos cuando apliquen; moneda/cotización; líneas o regla explícita de montos globales; neto/IVA/tributos/exento/total; descuentos, envío y redondeo; fecha fiscal y vínculos de origen. D-03/D-05 deciden parciales, múltiples pagos, saldo, sobrepago y cambios posteriores. Al autorizar se agregan CAE/CAEA según aplique, vencimiento, tipo/número, QR, mensajes y evidencia remota saneada.

La representación PDF/HTML, su entrega y retención son un adaptador posterior: no se habilitan sin requisitos regulatorios, producto y D-05/D-06 trazados.

## Decisiones abiertas adicionales

| ID | Decisión | Gate relacionado |
| --- | --- | --- |
| SC-01 | Evento durable y política exacta que crea elegibilidad. | D-05, D-07 |
| SC-02 | Fórmulas de claves, dedupe y correlación por proveedor. | D-07 |
| SC-03 | Mecanismo persistente de serialización por emisor + PV + tipo. | D-02, D-04 |
| SC-04 | Modelo físico/migraciones y retención de evidencia saneada. | D-01..D-07 |
| SC-05 | Flujo de rectificación para refund/chargeback. | D-06 |
| SC-06 | Representación y entrega del comprobante. | D-05 |
| SC-07 | Ownership/provenance del inbox-outbox y su atomicidad con pagos. | D-07 |

## Criterios de aceptación para una futura implementación

- Un pago duplicado o webhook repetido no crea dos intenciones ni dos solicitudes ARCA.
- Un timeout después del envío se reconcilia antes de cualquier reintento.
- Los datos de una factura autorizada se pueden auditar sin volver a leer entidades comerciales mutables.
- Certificados, claves, tokens, payloads sensibles y PII no aparecen en logs, URLs, fixtures ni respuestas GET.
- El flujo no habilita evasión, monto alternativo, ocultamiento de ventas ni bypass de controles fiscales.
