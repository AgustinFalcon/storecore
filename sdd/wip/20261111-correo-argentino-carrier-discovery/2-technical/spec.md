# Especificación técnica — Correo Argentino carrier discovery

**Estado:** `documented_deferred` · **Fecha:** 2026-11-11

## Boundary propuesto

```text
checkout/order application
        │
        ├── CarrierQuotePort
        ├── CarrierShipmentPort
        ├── CarrierLabelPort
        └── CarrierTrackingPort
                    │
          CorreoArgentinoAdapter
                    │
      contrato oficial seleccionado (uno)
```

Dominio y application no importan Spring, HTTP, JSON ni nombres de códigos
remotos. El adapter traduce wire en un único borde. La instalación es
single-tenant: la configuración refiere al merchant local y no contiene
`store_id`.

## Contratos oficiales observados

### MiCorreo API, documento fechado 2025-01-14

- QA `https://apitest.correoargentino.com.ar/micorreo/v1` y producción
  `https://api.correoargentino.com.ar/micorreo/v1`.
- Basic Auth obtiene JWT; credenciales diferenciadas por ambiente.
- Documenta `/agencies`, `/rates`, `/shipping/import` y
  `/shipping/tracking`.
- Import devuelve `createdAt`, mientras tracking exige `shippingId`; el manual
  no cierra públicamente esa correlación. Tracking también presenta GET con body,
  un typo de ruta en el curl y respuestas 200 de formas diferentes.
- El manual enumera 409/429 en su tabla HTTP, pero no documenta header de
  idempotencia, rate limit numérico ni webhook.

### PAQ.AR API 2.0, manual público Abril 2023

- Patrón exteriorizado de test
  `https://apitest.correoargentino.com.ar/paqar/v1/<resource>` y producción
  `https://api.correoargentino.com.ar/paqar/v1/<resource>`. La configuración
  futura debe modelar el prefijo `/paqar` y componer una sola vez el resource
  path `/v1/...`; nunca duplicar `/v1`.
- Headers `Authorization: Apikey <key>` y `agreement`; el acuerdo se gestiona
  con el área comercial.
- Documenta auth, alta `/v1/orders`, cancelación, rótulos `/v1/labels`,
  tracking `/v1/tracking` y sucursales `/v1/agencies`.
- El manual indica que sólo el primer elemento de `parcels` se procesa y que
  `shipmentClientId` no era funcional en la versión inicial. Ninguno puede
  sostener multibulto o idempotencia sin addendum/homologación.
- No documenta cotización, webhook, rate limit, idempotencia garantizada ni
  política completa de reintento/conciliación.

Los contratos no se mezclan. `CA-D01` selecciona producto/API y Correo debe
confirmar manual/version vigente, servicios y compatibilidad.

## Tipos cerrados obligatorios

- `CarrierCapabilityState`: `Disabled`, `ReadOnly`, `Active`, `Paused`,
  `Error`, `Unknown`.
- `CarrierProvider`: `CorreoArgentino`, `Unknown`.
- `CarrierDeliveryMode`: `HomeDelivery`, `AgencyPickup`, `LockerPickup`,
  `Unknown`.
- `CarrierOperationState`: `Pending`, `Submitted`, `Accepted`,
  `ReconciliationRequired`, `Rejected`, `Cancelled`, `Unknown`.
- `CarrierShipmentState`: `Preimposed`, `Admitted`, `InTransit`,
  `DeliveryAttempted`, `AwaitingPickup`, `Delivered`, `Returning`, `Returned`,
  `Cancelled`, `Expired`, `Unknown`.
- `CarrierErrorKind`: `InvalidRequest`, `Unauthorized`, `Forbidden`,
  `Conflict`, `RateLimited`, `RemoteUnavailable`, `TimeoutAmbiguous`,
  `MalformedResponse`, `Unknown`.

Cada tipo tiene un solo `fromWire` en infrastructure. Los textos remotos se
guardan saneados como evidencia, nunca gobiernan transición o etiqueta de UI.
Cada comando del flujo (`Quote`, `CreateShipment`, `FetchLabel`,
`RefreshTracking`, `CancelPreimposition`, `Reconcile`) es un objeto con una
responsabilidad y se ordena mediante un coordinador.

## Seguridad, durabilidad y recuperación

- Secretos por referencias opacas separadas QA/PROD; no settings editables en
  el browser. Base URL fija/allowlisted por environment, HTTPS obligatorio,
  límites de conexión/lectura/respuesta y sin redirects arbitrarios.
- Outbox local durable precede la llamada mutadora. Una operation key estable
  por instalación/pedido/intento permite dedupe local, no exactly-once remoto.
  La respuesta se persiste antes de publicar efectos en UI.
- Un timeout después del envío es `ReconciliationRequired`: consultar por
  referencia/tracking/operación según contrato antes de repetir. Si el contrato
  no permite reconciliar de forma inequívoca, la operación se pausa para USER.
- Tracking se obtiene por polling acotado con jitter/backoff y presupuesto. No
  existe receiver/webhook hasta evidencia oficial; 429 respeta `Retry-After`
  cuando esté presente y nunca genera loop agresivo.
- PII se minimiza a los campos contractuales, se cifra/autoriza según política,
  se redacta en observabilidad y se retiene por plazo `CA-SC08`. Payloads y PDF
  no se copian a logs ni mensajes de error.
- PDF de rótulo: tamaño y cantidad limitados, magic bytes/MIME verificados,
  nombre generado localmente, `Content-Disposition: attachment`,
  `nosniff`, cache privada/no-store y acceso USER. No se ejecuta ni renderiza
  HTML remoto como confiable. Se valida cada elemento: un HTTP 200 o un `status`
  general no neutraliza un `result` de error, Base64 inválido o TN incorrecto.
- `CARRIERS` sólo escribe en `ACTIVE`. Kill switch estrecho incluye owner,
  reason, created_at, expires_at, removal_ticket y acción. `READ_ONLY` permite
  conciliación/tracking, no alta/cancelación.

## Persistencia candidata — no autorizada todavía

Un WIP posterior debe justificar tablas separadas para quote snapshot,
operación/outbox, vínculo provider shipment, eventos remotos append-only y
auditoría. No se agrega DDL en este discovery. Debe reutilizar el shipment local
sin convertir un tracking code en autoridad de estado y preservar migraciones
publicadas.

## Pruebas futuras obligatorias

1. Contract fixtures redactados por endpoint y código HTTP, incluidos wire
   desconocido/malformado, 401/403/409/429/5xx y payload/PDF sobredimensionado.
2. Testcontainers PostgreSQL: dedupe, crash, respuesta perdida, dos workers,
   orden de locks y replay.
3. QA oficial: credenciales separadas, opciones habilitadas por agreement,
   cotización/expiración, alta, rótulo, tracking y cancelación/reconciliación.
4. Browser real: CUSTOMER/USER separados, CSRF, ownership, a11y y ausencia de
   secretos/PII en storage, URL, consola y red de terceros.
5. Instalación limpia/upgrade/rollback/kill switch; capability vuelve a
   `DISABLED` tras homologación hasta aprobación de release.

## Gate

NO-GO para código. El adapter sólo puede abrirse tras `CA-D01..CA-D10`,
`CA-SC01..CA-SC10`, credenciales QA por referencia y doble review Sol.
