# Spec técnico — decisión de entrega en checkout

## Fuente de verdad

Reutilizar `module_configurations` para `MANUAL_FULFILLMENT`; no agregar columnas
de tarifa a `installation_settings`. El JSON esquema 2 contiene:

```json
{
  "pickup": {"enabled": true, "label": "Retiro en local", "cost": "0.00", "minDays": 0, "maxDays": 1, "destination": "Sucursal", "instructions": "Presentar DNI"},
  "localDelivery": {"enabled": true, "label": "Entrega local", "cost": "4500.00", "minDays": 2, "maxDays": 5}
}
```

El reader exige estado `ACTIVE`, `config_schema_version=2` y valida el documento
completo. Una opción deshabilitada se omite; un documento inválido invalida todas
las opciones para evitar una configuración parcialmente interpretada.

## Migración y administración

V22 crea `manual_fulfillment_schema_v2_valid(jsonb)` y modifica
`enforce_module_configuration_mutation` sin debilitar BlackStore ni los módulos
schema 1. La fila legacy `MANUAL_FULFILLMENT` pasa, bajo autoridad del migrador, a
schema 2 con retiro y entrega presentes pero deshabilitados, manteniendo estado y
sin atribuir la actualización a un usuario ficticio. La migración amplía el CHECK
de `shipments.status` para `READY_FOR_PICKUP` y `PICKED_UP`.

`JdbcCapabilityService` reconoce y valida schema 2 para este módulo. Cambiar solo
el estado preserva el documento actual; nunca lo reemplaza por `{}`. Agregar un
comando admin tipado `PUT /api/v1/user/capabilities/MANUAL_FULFILLMENT/policy` que
exige ADMIN, CSRF, sesión revalidada, motivo, correlación y `expectedConfigVersion`.
El writer bloquea la fila `FOR UPDATE`, aplica CAS, revalida la sesión después de
esperar el lock, usa la función auditada y retorna la versión nueva. No se exponen
secretos ni se concede DML directo al runtime.

## Dominio backend

Crear `DeliveryMode` como `enum class` (`PICKUP`, `LOCAL_DELIVERY`, `UNKNOWN`) con
único `fromWire`. Crear value objects `DeliveryQuote` y `DeliveryPolicySnapshot`.
`ManualFulfillmentPolicyReader` solo lee/valida configuración y produce opciones
conocidas. `CheckoutDeliveryResolver` resuelve una selección y valida dirección;
no conoce HTTP ni UI.

El contrato de carrito incorpora `deliveryOptions`, cada una con `mode`, `label`,
`cost`, `currency`, `minDays`, `maxDays`, `requiresAddress`,
`configurationVersion`, `destination` e `instructions`. En entrega los dos últimos
pueden ser nulos porque el destino se obtiene de la dirección elegida; en retiro
son obligatorios y se muestran antes de confirmar. Una lista vacía es válida como
lectura pero impide checkout.

## Comando y transacción

`POST /api/v1/customer/checkout` acepta `deliveryMode`,
`deliveryConfigurationVersion`, `cartRevision`, `addressId` nullable y
`addressRevision` nullable. El carrito expone una revisión SHA-256 canónica de
moneda+líneas; cada dirección expone su `updated_at` como revisión. El borde
traduce modo y revisiones una sola vez. Unknown, revisión inválida, versión inválida
o combinaciones contradictorias producen 4xx.
La cotización seleccionada en el store conserva modo+versión+hechos presentados y
no se reemplaza por otra respuesta GET sin invalidar explícitamente la selección.

Dentro de checkout:

1. buscar primero el reclamo idempotente por cliente+clave; si existe, comparar el
   fingerprint inmutable del comando (modo, versión, revisiones, addressId nullable y moneda)
   contra el snapshot y repetir la orden sin leer carrito, política ni dirección
   actuales;
2. para una clave nueva, bloquear la fila del carrito, recalcular su revisión y
   compararla con el comando; una diferencia produce `CHECKOUT_CONTEXT_CHANGED`
   antes de cualquier efecto;
3. bloquear la fila de configuración `FOR SHARE` hasta commit, exigir la versión
   seleccionada y resolver la política dentro de esa misma transacción;
4. resolver modo; para entrega cargar la dirección propia `FOR SHARE` y comparar
   su revisión; para retiro prohibir dirección y revisión como hechos contradictorios;
5. incluir modo, versión, costo, plazo, destino e instrucciones normalizados en el
   hash y snapshot;
6. calcular subtotal, envío y total mediante un value object ARS que exige escala
   máxima 2 y `0..999999999999.99`; validar el total antes de cualquier reserva;
7. reservar stock y crear orden con `shipping_cost=quote.cost` y
   `total=subtotal+cost`;
8. crear pago por el total;
9. crear shipment pendiente.

La carrera de idempotencia compara el fingerprint del comando y el hash completo.
El replay usa la evidencia persistida y devuelve la orden original aun con carrito
vacío, dirección editada o configuración posterior distinta. `orders.shipping_cost`,
`total`, `buyer_snapshot` y `checkout_snapshot` ya soportan la evidencia; V22 solo
amplía configuración y estados de retiro. La proyección de orden lee delivery desde
el snapshot cerrado y nunca del texto actual de configuración.

## Snapshot

`checkout_snapshot.delivery` guarda modo wire, etiqueta, costo/currency, min/max,
requiresAddress, configurationVersion, destination e instructions. Para entrega,
destination es la dirección copiada; para retiro, el lugar configurado.
`buyer_snapshot` conserva identidad; agrega dirección solo para entrega. Pedidos
históricos sin este bloque quedan con modalidad `Unknown`; no se infiere desde
textos ni se consulta configuración actual.

## Ciclo de fulfillment

`ShipmentStatus` agrega `READY_FOR_PICKUP` y `PICKED_UP`; siguen siendo casos
cerrados en Kotlin y TypeScript. `DeliveryMode` del snapshot selecciona la máquina:

- entrega: `PENDING -> PREPARING -> SHIPPED -> DELIVERED`;
- retiro: `PENDING -> PREPARING -> READY_FOR_PICKUP -> PICKED_UP`.

El backend rechaza transiciones cruzadas y tracking en retiro. Proyección, timeline,
CTA, filtros y copy usan el modo. RMA considera final `DELIVERED` o `PICKED_UP`.
Un tipo cerrado `DeliverySnapshotState` distingue `Known`, `LegacyMissingBlock` e
`Invalid`. Solo la ausencia comprobada del bloque en una orden histórica usa el
ciclo legacy. Un bloque presente con wire futuro, corrupto o incompleto queda
`Invalid`, falla cerrado y no habilita acciones de fulfillment ni RMA.

## Frontend

Crear clase cerrada TypeScript `DeliveryMode` con constructor privado, instancias
estáticas y único `fromWire`; `Unknown` no es seleccionable. El mapper HTTP traduce
las opciones y rechaza campos inválidos a `Unknown`/lista no operable.

`CartState` guarda `deliveryMode` y deriva la opción seleccionada. Cambiar modo o
dirección tras retry/success abre un intento nuevo. `canPay` usa
`option.requiresAddress`, no compara el wire. El comando serializa únicamente
modo, versión, revisiones y dirección opcional; jamás dinero. Un
`CHECKOUT_CONTEXT_CHANGED` descarta el intento congelado, genera nueva clave,
recarga carrito+direcciones y exige confirmación humana sobre los hechos nuevos.

La vista presenta tarjetas/radios accesibles, costo, plazo y total. Muestra el
selector de dirección solo cuando lo exige la opción. Durante Pending deshabilita
modo, dirección y CTA. Sin opciones muestra un error accionable.

## Pruebas

- Dominio: `DeliveryMode.fromWire`, Unknown y política válida/inválida.
- Backend HTTP: pickup sin dirección, delivery propia, ajena/ausente, modo unknown,
  versión stale, configuración disabled/malformed, total/pago/snapshot exactos.
- Admin policy: autorización, CSRF, CAS, sesión revocada tras lock, auditoría,
  schema inválido y cambio de estado que preserva config.
- Idempotencia: replay igual; conflicto por modo/dirección/versión.
- Contexto autoritativo: carrito 1→3 y edición de la misma dirección después del
  comando fallan sin efectos cuando no hay reclamo; con reclamo existente el replay
  devuelve la orden histórica.
- Concurrencia: configuración no cambia entre resolución, reservas y commit.
- Dinero: suma máxima válida, overflow de subtotal+shipping y rollback sin efectos.
- Frontend mapper: todos los wires, dinero/plazos inválidos y Unknown.
- Store: canPay por modo, cambio abre intento, pending congela, payload sin dinero.
- Vista: opciones, plazo/costo/total, dirección condicional, estados vacíos.
- Fulfillment: máquinas separadas, retiro sin tracking, timeline, filtros y RMA.
- E2E real browser: retiro sin direcciones hasta `PICKED_UP` y RMA; entrega con
  costo positivo; preview, orden y pago conservan el total.
- Regresión completa backend, frontend, build y smokes existentes.

