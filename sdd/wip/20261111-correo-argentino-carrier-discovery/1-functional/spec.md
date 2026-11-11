# Especificación funcional — Correo Argentino carrier discovery

**Estado:** `documented_deferred` · **Fecha:** 2026-11-11

## Problema

StoreCore hoy calcula y muestra fulfillment local/manual, pero no puede afirmar
precio, cobertura, sucursal, admisión, rótulo, tracking ni entrega de Correo
Argentino. La integración futura debe incorporar hechos del carrier sin permitir
que una respuesta del navegador, un número de seguimiento o una etiqueta se
interpreten como despacho o entrega confirmados.

## Actores y recorridos esperados

1. **Comprador:** ingresa un destino, recibe opciones cotizadas vigentes y
   permitidas, elige domicilio o sucursal y ve el costo/ventana informados por el
   carrier. Si el dato es desconocido o venció, no se inventa una opción.
2. **Administrador USER:** configura sólo referencias de cuenta/servicio,
   dimensiones y origen aprobados; prepara un pedido pagado, solicita el envío,
   obtiene un rótulo verificable y consulta el historial.
3. **Operaciones:** distingue preimposición, admisión física, tránsito, intento,
   retiro, entrega, devolución/caducidad, cancelación y estado desconocido.
4. **Soporte:** conserva correlación y evidencia saneada para conciliación y
   reclamo sin exponer PII ni secretos.

## Capacidades candidatas

| Capacidad | Evidencia pública | Estado del producto |
| --- | --- | --- |
| Cotización por origen/destino/peso/medidas | MiCorreo `/rates` | Confirmada documentalmente; requiere cuenta y prueba contractual. |
| Sucursales habilitadas | MiCorreo `/agencies`; PAQ.AR `/v1/agencies` | Confirmada; la habilitación depende del cliente/acuerdo. |
| Importación/alta | MiCorreo `/shipping/import`; PAQ.AR `/v1/orders` | Confirmada; debe elegirse un único contrato canónico. |
| Rótulo PDF | PAQ.AR `/v1/labels` | Confirmada para PAQ.AR; no inferirla para MiCorreo API pública. |
| Tracking/historial | MiCorreo `/shipping/tracking`; PAQ.AR `/v1/tracking` | Confirmada como consulta; no hay webhook público documentado. |
| Cancelar preimposición | PAQ.AR `/v1/orders/{trackingNumber}/cancel` | Confirmada antes de imposición; rescate/devolución requiere contrato. |
| GPS/mapa en tiempo real | No documentado | Fuera de alcance. Sólo puede mapearse una sucursal oficial. |
| Webhook de eventos | No documentado en los manuales públicos revisados | No disponible por supuesto; polling acotado hasta evidencia contractual. |

MiCorreo importa una orden pero su respuesta pública sólo muestra `createdAt`;
el origen del `shippingId` que luego exige tracking debe confirmarse en QA.
PAQ.AR publica un array de `parcels`, pero el manual aclara que la versión
documentada procesa sólo el primer elemento. El alcance inicial es un bulto por
envío; multibulto permanece bloqueado hasta contrato y prueba explícitos.

## Requisitos funcionales

- **CA-R01 — fuente autoritativa:** precio, ventana, servicio, sucursal y evento
  postal provienen de una respuesta oficial fresca y conservan fuente/fecha.
- **CA-R02 — cotización:** una cotización tiene expiración, moneda, importe,
  servicio, modalidad, dimensiones/peso y destino normalizados. Una cotización
  vencida o `Unknown` no habilita checkout.
- **CA-R03 — snapshot:** la orden congela la opción elegida y su precio; un
  cambio posterior de tarifa no reescribe el histórico.
- **CA-R04 — modalidades cerradas:** `HomeDelivery`, `AgencyPickup` y, sólo si
  el acuerdo lo habilita, `LockerPickup`; valores nuevos son `Unknown` y fallan
  cerrado.
- **CA-R05 — creación:** sólo un pedido pago/elegible puede solicitar envío. La
  clave local de operación evita que StoreCore despache concurrentemente la
  misma intención, pero no puede garantizar que el proveedor no haya creado un
  duplicado tras una respuesta perdida. Ese resultado queda bloqueado en
  conciliación y nunca habilita un reenvío ciego. `shipmentClientId` no es
  evidencia suficiente: el propio manual PAQ.AR lo declara no funcional en su
  versión inicial.
- **CA-R06 — rótulo:** obtener un PDF no acredita admisión. El archivo se valida,
  se limita y se entrega con autorización USER; no se registra su contenido.
- **CA-R07 — tracking:** los eventos remotos se conservan append-only y se
  traducen una sola vez a estados cerrados. Texto/código nuevo queda `Unknown`,
  visible como “estado no reconocido” y no como entregado. Un HTTP 200 con lista
  vacía, error de negocio o estructura inesperada no acredita progreso.
- **CA-R08 — cancelación:** sólo se intenta en una preimposición elegible. Un
  timeout o respuesta ambigua pasa a conciliación antes de reintentar.
- **CA-R09 — recuperación:** no entrega, guarda, caducidad, retorno y reclamo se
  muestran sólo con evidencia del contrato/evento. StoreCore no garantiza la
  entrega física.
- **CA-R10 — fail closed:** capability distinta de `ACTIVE`, contrato vencido,
  credencial ausente, error de mapeo o kill switch bloquean escrituras externas
  sin romper fulfillment manual.

## Criterios de aceptación para un WIP futuro

- AC-01: QA oficial prueba autenticación, cotización, sucursales, alta/import,
  rótulo cuando aplique, tracking, cancelación y respuestas negativas.
- AC-02: refresh/doble clic/replay/crash no crean dos envíos ni dos efectos
  locales; toda incertidumbre queda conciliable.
- AC-03: CUSTOMER sólo ve sus órdenes y tracking saneado; USER opera con CSRF,
  autorización y auditoría separadas.
- AC-04: no hay secretos/PII en browser storage, URL, métricas, excepciones,
  fixtures ni repositorio.
- AC-05: cada código remoto probado tiene traductor cerrado y `Unknown`; la UI
  no compara literales remotos.
- AC-06: instalación limpia, upgrade, rollback y kill switch conservan
  fulfillment manual y nunca marcan entregado por defecto.

## Fuera de alcance

Paq.ar Full/warehousing, geolocalización del paquete, optimización de rutas,
aduana/internacional, promesa universal de lockers, scraping del portal,
reclamos automatizados, reembolso de flete y activación StoreCore↔BlackStore.
