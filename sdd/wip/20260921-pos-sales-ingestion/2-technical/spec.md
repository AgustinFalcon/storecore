# Technical Spec — `pos-sales-ingestion`

**Status:** `superseded` · **Fecha:** 2026-09-21 · **Feature:** `feat-20260921-pos-sales-ingestion`

**HISTÓRICO — NO IMPLEMENTAR.** Deprecado para companion BlackStore por `20260921-storecore-pos-integration-contract-v1` (2026-09-21). No implementar ISSUE/REVERSAL.

<!-- superseded_by: sdd/wip/20260921-storecore-pos-integration-contract-v1/2-technical/spec.md -->

Delta DDL: `sdd/wip/20260921-pos-sales-ingestion/2-technical/data-model-delta.md`. **No** editar `data-model-v1.md` ni el WIP baseline. Sin `store_id`. Sin secretos en spec, logs ni fixtures.

## Architecture

```text
POS externo (BlackStore) → HTTP adapter (Bearer instalación)
        → port InventoryExternalIssue (application)
        → lock SELECT FOR UPDATE inventory_balances
        → append inventory_ledger (NO SALE) + envelope idempotente
        → commit
        → channel_listings.desired_quantity + channel_outbox
Kotlin domain sin Spring/JPA/HTTP. Persistence y HTTP son adapters.
```

Inbound port: `InventoryExternalIssue`. Adapter de entrada: HTTP interno. Adapters de salida: persistencia PostgreSQL (ledger, balances, envelope) y outbox ML existente. No hay adapter de ticket, MP, fiscal ni cookies USER/CUSTOMER.

## Capability y kill switch

Módulo futuro opcional `EXTERNAL_INVENTORY_INGESTION` (`future_optional = TRUE`), acciones `INGEST` (`allows_write = TRUE`) y `READ_BALANCE` (`allows_write = FALSE`). `module_configurations.state` nace `DISABLED`. El writer POST sólo corre si estado `ACTIVE` y **no** hay kill switch activo de `INGEST`. El GET usa `READ_BALANCE` (o el módulo `ACTIVE` sin kill de esa acción). `PAUSED`/`ERROR`/expirado/malformed → fail closed. Prohibido `feature_flags` y booleanos permanentes.

## Auth

Credencial de **instalación**, no cookie de admin ni de customer. Header `Authorization: Bearer`. El token se compara en tiempo constante contra el secreto resuelto por referencia opaca en `module_configurations.config` (`credential_secret_ref` → secret manager / `.env`). Sin el secreto, sin `ACTIVE`, o con kill switch → 401/403, sin tocar ledger.

## Mapeo `operation_key` (string → ledger UUID)

Baseline: `inventory_ledger.operation_key UUID NOT NULL UNIQUE` (WEB/ML). Caller POS envía string (`bs:ticket-123:issue`).

**Elegido:** conservar `operation_key UUID` + agregar `business_key VARCHAR(160) NULL` con `UNIQUE` parcial `WHERE business_key IS NOT NULL`.

| Columna | WEB/ML (sin cambio) | ISSUE/REVERSAL externo |
|---|---|---|
| `operation_key` | UUID de reserva/venta | UUID v5 determinístico `uuid5(NAMESPACE_POS_INGEST, business_key)` |
| `business_key` | NULL | string del request, único |

`CHECK`: si `event_type` ∈ {`INVENTORY_ISSUE_EXTERNAL`,`INVENTORY_REVERSAL_EXTERNAL`} entonces `business_key IS NOT NULL` y `channel = 'EXTERNAL'`. No se cambia el tipo UUID: las claves WEB/ML siguen válidas.

Envelope `inventory_external_operations` (UNIQUE `business_key`) guarda resultado durable para `DUPLICATE`. `CONFLICT` (deadlock) **no** se persiste: rollback y retry misma clave.

Payload distinto con la misma `business_key` → 400, sin mutar el envelope/asiento original.

## Event type y canal — no `SALE`

Ampliar CHECKs de `inventory_ledger`:

- `event_type`: existentes + `INVENTORY_ISSUE_EXTERNAL` + `INVENTORY_REVERSAL_EXTERNAL`. **Prohibido** usar `SALE` para este flujo.
- `channel`: existentes + `EXTERNAL`.

`quantity_delta`: ISSUE negativo; REVERSAL positivo, espejo de las líneas del ISSUE. Sin precio. `external_order_id` = `external_ref`. `actor` = `external_system` (varchar; no hardcodear el cliente en DDL).

Reportes de venta StoreCore: `event_type = 'SALE' AND channel IN ('WEB','MERCADO_LIBRE')`. Estos asientos no califican.

## Oversell vs CHECK `available_quantity >= 0`

El CHECK baseline impide el oversell autorizado. **No se deja abierto.**

**Elegido:** el saldo `available_quantity` puede ser negativo (verdad del pool). Se agrega `oversell_open BOOLEAN NOT NULL DEFAULT FALSE`.

```
CHECK (reserved_quantity >= 0 AND safety_stock >= 0
  AND (
    (available_quantity >= 0 AND oversell_open = FALSE)
    OR (available_quantity < 0 AND oversell_open = TRUE)
  ))
```

- Sin `allow_oversell`: hace falta `available_quantity >= quantity` (se **puede** perforar `safety_stock`; el piso es 0, no `safety_stock`).
- Con `allow_oversell`: `available_quantity` puede quedar `< 0` y `oversell_open = TRUE`.
- REVERSAL recálcula el flag: si el nuevo available ≥ 0 → `oversell_open = FALSE`.
- `reserved_quantity` no cambia. La reserva WEB no se borra.

## Lock

En una transacción, para los `variant_id` del request **ordenados ASC** (anti-deadlock): `SELECT * FROM inventory_balances WHERE variant_id = ? FOR UPDATE`. Si el variant existe y no hay fila de balance, insertar ceros y relock. Variante inexistente o inactiva → `INVALID_SKU` (nada commit). Deadlock/serialization → `CONFLICT`.

Líneas todo o nada: validar todas bajo lock; escribir ledger + balances + envelope en el mismo commit o rollback total.

## `next_web_delivery_at`

Candidatos **pendientes de cumplimiento** para la variante:

1. **WEB:** `order_items.variant_id` + `orders.status IN ('PENDING_PAYMENT','PAID')` + shipment ausente o `shipments.status IN ('PENDING','PREPARING','SHIPPED')`. Las reservas ACTIVE del variant se cubren vía órdenes `PENDING_PAYMENT` (no hay `order_id` en `inventory_reservations`; no se inventa el join).
2. **ML:** fila en `channel_sales` de esa variante sin asiento posterior `REFUND`/`RETURN_RECEIVED` del mismo `external_order_id`.

`next_web_delivery_at = MIN(fecha prometida no nula)` de esos candidatos.

- **TBD-1:** WEB usa `orders.promised_fulfillment_at` — **no está** en `data-model-v1`. Este feature **no** la agrega (es SLA de fulfillment, no de ingestión).
- **TBD-2:** ML usa `channel_sales.promised_fulfillment_at` — **no está** en `data-model-v1`. Este feature **no** la agrega.

Si no hay candidato: `null` y `oversell_allowed = false`. Si hay candidato y las fechas TBD son null: `oversell_allowed = true`, `next_web_delivery_at = null`.

## Tras commit — ML

`desired_quantity = GREATEST(0, available_quantity - safety_stock)` por listing ACTIVE de la variante. Encolar `channel_outbox` (`kind` stock/quantity sync, `idempotency_key` UUID propio). El worker ML publica desired; **`observed_quantity` no escribe el ledger**. Fallo de outbox no revierte el ISSUE (retry de outbox).

## HTTP

`GET /internal/v1/inventory/balances/{variant_id}` — saldo para BlackStore (alerta oversell). 200: `{ "variant_id", "available_quantity", "reserved_quantity", "oversell_open" }`. 404 si variante inexistente. Sin ticket ni precio.

`POST /internal/v1/inventory/external-operations`

Request (contrato cerrado):

```json
{
  "operation_key": "bs:ticket-123:issue",
  "operation_kind": "ISSUE",
  "external_system": "BLACKSTORE",
  "external_ref": "blackstore:ticket-123",
  "occurred_at": "2026-09-21T15:30:00-03:00",
  "lines": [
    { "variant_id": 1001, "quantity": 1, "allow_oversell": false }
  ]
}
```

`operation_kind`: `ISSUE` | `REVERSAL`. `quantity` entero > 0. `lines` no vacío.

| `result` | HTTP | Notas |
|---|---|---|
| `OK` | 200 | commit ledger |
| `DUPLICATE` | 200 | mismo cuerpo que el resultado original |
| `NO_STOCK` | 409 | por línea: `available_after`, `next_web_delivery_at`, `oversell_allowed`; sin mutación |
| `INVALID_SKU` / `INVALID_QUANTITY` | 400 | |
| `REVERSAL_NOT_ALLOWED` | 422 | sin ISSUE exitoso o ya revertido; **no** hay chequeo de factura |
| `CONFLICT` | 409 | retry misma clave |
| no auth / capability | 401/403 | |

`OK` (ISSUE): `{ "result":"OK", "operation_key":"…", "lines":[{ "variant_id":1001, "quantity":1, "available_after":4 }] }`.

REVERSAL: busca ISSUE `OK` con el mismo `external_ref` (o `issue` sibling key) no revertido; si falta o ya hay REVERSAL `OK` → `REVERSAL_NOT_ALLOWED`.

## Tests (obligatorios)

1. **Idempotencia:** ISSUE `OK` + retry misma clave → `DUPLICATE` / mismo cuerpo; un solo asiento.
2. **Carrera dos POS:** dos `operation_key` distintas, misma variante, stock para una; lock serializa; no oversell silencioso.
3. **POS vs reserva WEB:** reserva ACTIVE intacta; `reserved_quantity` igual; ISSUE sin `allow_oversell` no come reserved.
4. **Oversell:** sin flag → `NO_STOCK` y available ≥ 0; con flag → available negativo, `oversell_open`, reserva WEB sigue.
5. **Reversal:** sin ISSUE → `REVERSAL_NOT_ALLOWED`; segundo REVERSAL → `REVERSAL_NOT_ALLOWED`; no hay rama “hay factura”.

Además: CHECK rechaza `available_quantity < 0 AND oversell_open = FALSE`; reportes `SALE` no cuentan ISSUE externo.

## Gates

Flyway/Testcontainers del **delta** (CHECKs, UNIQUE `business_key`, capability). Tests de arquitectura hexagonal (domain sin Spring). **Luna no implementa** hasta Sol GO de **este** feature. El GO de `storecore-core-v1.0.0` no vale aquí.
