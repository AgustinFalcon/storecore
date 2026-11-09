# Spec técnico — disposición RMA por ítem

## Dominio

- Kotlin: `enum` o `sealed class` para `ReturnDisposition`, `DamageReason`, `RejectionReason`, elegibilidad y resultados. `Unknown` bloquea mutación.
- TypeScript: clase con constructor privado, instancias estáticas y único `fromWire`; vista/store/test no comparan strings mágicos.
- `DispositionQuantities` valida enteros no negativos y suma exacta.
- El flujo se compone con pasos/objetos de responsabilidad única: editar, revisar, confirmar y recuperar.

## Persistencia forward-only

- Nueva migración posterior a V14; no se editan migraciones publicadas.
- `return_items` conserva históricos y recibe clasificación durable por cantidades; registros previos permanecen sin inferencia.
- Constraint: cantidades no negativas y, al confirmar, suma igual a `quantity`.
- Tabla/comando durable con clave idempotente única, `UNIQUE(return_id)`, hash canónico del payload, actor, RMA, timestamps y resultado.
- Auditoría por línea con cantidades, motivos y ledger asociado.
- La migración agrega explícitamente `RMA_RESTOCK` al check de `inventory_ledger.event_type`, permitido sólo con canal `INTERNAL`, y actualiza mediante DDL forward los constraints vigentes de V1/V6 sin editar migraciones publicadas.
- Un ledger `RMA_RESTOCK` positivo por línea con RESTOCK > 0, vinculado de forma única al `return_item`; DAMAGED/REJECTED no crean delta vendible.
- `returns.inspection_result` legacy no es autoridad para resultados mixtos; el agregado confirmado termina `CLOSED`.

## Transacción y locks

1. Validar sesión USER/capability/CSRF/origin en el borde existente.
2. Lock `orders` primero.
3. Buscar el comando durable por RMA/clave. Si existe: comparar hash y devolver el resultado original; no revalidar elegibilidad mutable. Hash distinto produce conflicto.
4. Sólo para comando nuevo, releer evidencia de pago, consumo y reversión.
5. Lock return y return_items; validar pertenencia, completitud y estado `RETURN_RECEIVED`.
6. Lock balances por `variant_id` ascendente.
7. Persistir comando, clasificación, ledger, balances, auditoría y `CLOSED` en una transacción.

Fallos posteriores a cualquier write hacen rollback total. Reintentos serializables/deadlock conservan la clave y el payload. Misma clave con hash distinto es conflicto no retryable.

## API/read model

- GET admin expone `returnId`, `returnItemId`, `orderItemId`, SKU/nombre snapshot, cantidad recibida, estado cerrado y clasificación confirmada opcional.
- POST de disposición recibe clave idempotente y todas las líneas. No acepta estado agregado inventado.
- GET autoritativo por devolución permite recuperar comando pendiente/confirmado sin exponer la clave. La UI conserva la clave no secreta en `sessionStorage` bajo `actorId + returnId` sólo hasta observar un resultado terminal; al rehidratar consulta GET antes de habilitar un POST nuevo.
- Los POST legacy de transición sin detalle siguen fail-closed.

## Frontend

- Dominio y mapper único traducen wire→tipos cerrados.
- Store separa read model, draft local y resultado durable. Cambio de actor/return elimina draft y clave local; reload rehidrata el intento pendiente y consulta el resultado autoritativo.
- La pantalla administrativa muestra editor por línea, resumen previo y confirmación explícita; no ofrece acción en Unknown/histórico incompleto.
- Mocks/fixtures cubren mixto, todo dañado, todo rechazado, conflicto, histórico, loading, denied y respuesta incierta.

## Seguridad y límites

- No confiar en cantidades, identificadores, estado o actor del cliente.
- No exponer claves idempotentes, actores ni motivos privados a CUSTOMER.
- No crear outlet, factura/NC, reembolso o evento de carrier.
- No compensar automáticamente una inspección confirmada.

## Pruebas

- Unitarias de tipos cerrados, traductores y partición.
- PostgreSQL real para constraints, clean/upgrade V14→nueva versión, locks, idempotencia y rollback, incluido retry después de cierre y después de reversión posterior.
- HTTP para autoridad, ownership, CSRF/origin/capability y errores cerrados.
- Browser real para edición→revisión→confirmación, delta vendible, pérdida de respuesta/reload y dos operadores.
- Regresión completa CFE: pago, SALE, shipment, recepción única y no-restock previo.
