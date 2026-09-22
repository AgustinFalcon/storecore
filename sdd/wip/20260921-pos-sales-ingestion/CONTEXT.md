# Contexto cerrado — fuente para specs (no es spec)

Paquete de negocio cerrado 2026-09-21. Correcciones: popup “entrega más próxima”; `REVERSAL_NOT_ALLOWED` sin factura.

## Invariante

Ventas StoreCore = WEB + ML. Ventas BlackStore = mostrador. Cruce = cantidades de variante, nunca importes.

## Este feature (StoreCore)

API servicio a servicio. Sin `store_id`. Credencial de instalación.

Request:

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

- `variant_id` es el BIGINT de `product_variants.id` (el ejemplo de catálogo no es un string de nombre).
- `operation_key` string: `bs:{ticket_id}:issue` | `bs:{ticket_id}:reversal`. El ledger baseline usa UUID; el spec técnico debe mapear (guardar string o UUID determinístico) sin romper WEB/ML.
- Multi-línea **todo o nada**.
- Retry = misma `operation_key`. Cambio de líneas o de `allow_oversell` = clave nueva.
- `allow_oversell` por línea.

Respuestas: `OK`, `NO_STOCK` (por línea: `available_after`, `next_web_delivery_at`, `oversell_allowed`), `DUPLICATE` (misma forma que el OK original), `INVALID_SKU`, `INVALID_QUANTITY`, `REVERSAL_NOT_ALLOWED` (no hay ISSUE o ya revertido; **StoreCore no evalúa factura**), `CONFLICT` (deadlock → retry misma clave).

Asiento: tipo inventario, no `SALE`. Canal nuevo o `event_type` nuevo (`INVENTORY_ISSUE_EXTERNAL` / reversal). Sin precio. Reportes de venta StoreCore lo ignoran.

Lock pesimista `SELECT … FOR UPDATE` sobre `inventory_balances` del variant. Safety stock: el mostrador **puede** perforarlo. Oversell autorizado: `available` puede quedar negativo; la reserva WEB **no se borra**. El CHECK `available_quantity>=0` del baseline **debe relajarse o reemplazarse** en el delta de este feature (el spec técnico elige cómo, sin mentir el saldo).

`next_web_delivery_at` = fecha prometida **más temprana** de órdenes WEB/ML con unidades reservadas o consumidas de ese variant, pendientes de cumplimiento. Si no hay: `null` y `oversell_allowed=false`.

Tras commit: actualizar `desired_quantity` / outbox ML. Stock remoto no pisa el ledger.

Reverso: StoreCore solo valida ISSUE existente y no revertido. Factura es regla de BlackStore.

Auth: servicio a servicio, credencial de instalación. Capability tipada + kill switch; no feature flag genérico.

No implementación. No tocar archivos del WIP baseline; documentar delta.
