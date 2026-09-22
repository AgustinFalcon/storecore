# Modelo de datos — BlackStore POS (runtime propio)

> **HISTÓRICO — NO IMPLEMENTAR.** Evidencia ISSUE/REVERSAL. Modelo vivo: BlackStore `sdd/wip/20260921-blackstore-pilot/2-technical/data-model-v1.md`.

**Status:** `historical_moved` · **Fecha:** 2026-09-21  
**Ámbito:** persistencia histórica de BlackStore. **No** es DDL StoreCore. **No** hay `store_id`. Sin secretos.

Convenciones: IDs enteros identidad; timestamps con zona; dinero `NUMERIC(14,2)`; `variant_id` BIGINT del catálogo StoreCore (referencia lógica, no FK cross-runtime).

## Entidades

```text
operators ──┬── cash_sessions ── cash_session_diffs
            ├── tickets ── ticket_lines
            │         ├── stock_attempts
            │         ├── payments
            │         ├── invoice_documents
            │         └── oversell_alerts
            └── invoice_batches ── invoice_documents
```

### `operators`

USER staff BlackStore. `id`, `email`, `display_name`, `role` ∈ {`OPERATOR`,`MANAGER`,`OWNER`}, `active`. No es StoreCore `CUSTOMER`.

### `tickets`

| Campo | Regla |
|---|---|
| `id` | PK local; forma `ticket_id` en `operation_key` |
| `status` | `PENDING_STOCK` \| `CLOSED` \| `CANCELLED` |
| `invoiced_at` | NULL hasta factura; si NOT NULL ⇒ prohibido `REVERSAL` |
| `oversell_committed` | true sólo en `CLOSED` con oversell aceptado |
| `replenish_by` | `next_web_delivery_at` del `OK` oversell; NULL si no aplica |
| `operator_id`, `cash_session_id` | staff y turno |
| `closed_at` | set al pasar a `CLOSED`; inmutable |

CHECK: `CLOSED` exige ≥1 línea. No UPDATE de `status` saliendo de `CLOSED`. Corrección = NC / ticket nuevo.

### `ticket_lines`

`ticket_id`, `variant_id`, `qty > 0`, `unit_price_snapshot` (precio de canal; puede ≠ web), `allow_oversell_used` bool. Importe de línea no viaja a StoreCore.

### `stock_attempts`

Auditoría del cliente HTTP. `ticket_id`, `operation_key` UNIQUE, `operation_kind` ∈ {`ISSUE`,`REVERSAL`}, `payload_hash`, `response_kind` (`OK`\|`NO_STOCK`\|`DUPLICATE`\|`INVALID_SKU`\|`INVALID_QUANTITY`\|`CONFLICT`\|`REVERSAL_NOT_ALLOWED`\|`HTTP_ERROR`), `http_status`, `occurred_at`. Insert **antes** del POST (`response_kind` NULL) o en la misma transacción que marca `PENDING_STOCK`. Un `OK`/`DUPLICATE` de ISSUE por ticket.

### `payments`

Cobros del ticket: `method`, `amount > 0`, `received_at`, `operator_id`. Suma vs total del ticket es dato de caja, no de StoreCore.

### `cash_sessions`

Turno: `operator_id`, `opened_at`, `closed_at`, `opening_float`, `closing_counted`. Al cierre, Σ pagos de tickets `CLOSED` de la sesión vs `closing_counted`.

### `cash_session_diffs`

Diferencia de arqueo: `cash_session_id`, `amount` (signed), `reason`, `recorded_by`, `recorded_at`. Obligatorio si hay desvío; no reescribe tickets.

### `invoice_batches`

Cierre día/lote/manual: `kind` ∈ {`TICKET`,`DAY`,`BATCH`,`MANUAL`}, `period_start`, `period_end`, `expected_total` = Σ importes de tickets `CLOSED` del período, `issued_total`. CHECK `issued_total = expected_total` al cerrar. Régimen/CAE no se modelan aquí.

### `invoice_documents`

Comprobante BlackStore: `ticket_id` (si `TICKET`) o `batch_id`, `issued_at`, `external_fiscal_ref` opaca (número que defina titular/contador). Marca `tickets.invoiced_at`. Post-factura: documento de NC en **otro** circuito; este modelo sólo anota `linked_credit_note_id` NULLABLE sin diseñar ARCA.

### `oversell_alerts`

Una por ticket comprometido. `ticket_id` UNIQUE activo, `qty_committed`, `replenish_by`, `state` ∈ {`OPEN`,`ESCALATED_MANAGER`,`ESCALATED_OWNER`,`CLEARED`}. Transiciones: vence sin cobertura → manager → owner. `CLEARED` cuando `available` StoreCore cubre; **nunca** escribe órdenes WEB. StoreCore no tiene esta tabla.

## Qué no existe aquí

Tablas StoreCore (`inventory_ledger`, órdenes WEB/ML, `customers`). `store_id`. Importes enviados al hermano. Modo de venta no facturada.
