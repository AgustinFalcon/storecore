# Especificación técnica — BlackStore POS operations (sistema externo)

> **HISTÓRICO — NO IMPLEMENTAR.** Puntero movido a BlackStore `blackstore-pilot` + OpenAPI StoreCore `storecore-pos-integration-contract-v1`. ISSUE/REVERSAL superseded.

**Status:** `historical_moved` / `superseded_non_executable` · **Fecha:** 2026-09-21  
**Feature:** `feat-20260921-blackstore-pos-operations`  
**Companion vivo:** `C:\Users\agustin\Desktop\BlackStore\sdd\wip\20260921-blackstore-pilot/`  
**Contrato canónico:** `../20260921-storecore-pos-integration-contract-v1/2-technical/api/blackstore-integration.openapi.yaml`

## Boundary

```text
Operador USER BlackStore → POS BlackStore (ticket/caja/factura/alertas)
                         → persistencia BlackStore (Postgres o equivalente)
                         → cliente HTTP servicio-a-servicio
                         → POST inventario StoreCore (ISSUE | REVERSAL)
StoreCore                 → ledger INVENTORY_ISSUE_EXTERNAL; sin ticket, precio, cobro ni factura
```

BlackStore es **otro** runtime. Este spec no agrega tablas, enums POS ni Flyway al core. Sin `store_id`. Credencial de instalación por referencia opaca a secret store; el valor nunca entra en specs, logs, GET ni fixtures. Deny-by-default: sin credencial válida y capability del hermano `ACTIVE`, no hay ISSUE.

## Invariantes

- Persistir `PENDING_STOCK` **antes** del HTTP. Sin fila durable no hay llamada.
- Un ISSUE exitoso por ticket. Retry = misma `operation_key`. Cambio de líneas o de `allow_oversell` = clave **nueva**.
- Multi-línea todo o nada: `NO_STOCK` ⇒ cero líneas consumidas en StoreCore.
- `CLOSED` inmutable en BlackStore. StoreCore no recibe importes ni factura.
- Facturado ⇒ el cliente **no** emite `REVERSAL`. StoreCore no conoce comprobantes.
- Cruce = `variant_id` + qty. Precio de canal es local y puede diferir del web.
- No modo de evasión, venta oculta ni doble libro.

## Cliente StoreCore

`POST` de consumo/reverso según `20260921-pos-sales-ingestion`. Cuerpo (ISSUE):

```json
{
  "operation_key": "bs:{ticket_id}:issue",
  "operation_kind": "ISSUE",
  "external_system": "BLACKSTORE",
  "external_ref": "blackstore:ticket-{ticket_id}",
  "occurred_at": "<ISO-8601 del mostrador>",
  "lines": [
    { "variant_id": 1001, "quantity": 1, "allow_oversell": false }
  ]
}
```

`variant_id` es BIGINT de catálogo StoreCore, no un nombre. `operation_kind` `REVERSAL` usa la clave de reverso y las mismas líneas del ISSUE exitoso. Auth: credencial de instalación (servicio a servicio), no JWT de `CUSTOMER` ni de operador BlackStore.

## Claves de idempotencia

| Uso | `operation_key` |
|---|---|
| Primer ISSUE del ticket | `bs:{ticket_id}:issue` |
| Reintento (mismo body) | idéntica a la clave del intento |
| Cambio de líneas o `allow_oversell` (quita línea; acepta oversell) | `bs:{ticket_id}:issue:{seq}` con `seq` entero ≥ 2 |
| Reverso pre-factura | `bs:{ticket_id}:reversal` |

Aceptar oversell **no** reutiliza `bs:{ticket_id}:issue`: nueva clave y `allow_oversell: true` **solo** en la línea que StoreCore marcó `NO_STOCK` con `oversell_allowed`. `external_ref` permanece `blackstore:ticket-{ticket_id}`.

## HTTP → estado de ticket

Mapeo alineado con `20260921-pos-sales-ingestion` (`POST /internal/v1/inventory/external-operations`). El cliente usa `result` del body; `NO_STOCK` y `CONFLICT` comparten 409.

| Kind StoreCore | HTTP | Ticket BlackStore |
|---|---|---|
| `OK` | 200 | `CLOSED`. Si alguna línea iba con `allow_oversell=true`, `oversell_committed=true` y `replenish_by=next_web_delivery_at` de esa respuesta. |
| `DUPLICATE` | 200 | Misma forma que el `OK` original de esa `operation_key`; no segundo ISSUE. |
| `NO_STOCK` | 409 | `PENDING_STOCK`. Cero líneas consumidas. Si `oversell_allowed` en la línea: popup de copia exacta con `next_web_delivery_at` (si la fecha es null: mismo texto y “sin fecha prometida; reponer cuanto antes”). |
| `INVALID_SKU` | 400 | `PENDING_STOCK`. Operador corrige/quita línea; clave nueva. |
| `INVALID_QUANTITY` | 400 | `PENDING_STOCK`. Idem. |
| `CONFLICT` | 409 | Retry **misma** clave; permanece `PENDING_STOCK`. |
| `REVERSAL_NOT_ALLOWED` | 422 | No hay ISSUE o ya revertido. StoreCore **no** evalúa factura. BlackStore no debe haber llamado si ya facturó. |
| no autorizado | 401 / 403 | Sin transición a `CLOSED`; `PENDING_STOCK`. Fail closed. |
| error / timeout | 5xx o red | Retry misma clave; intención ya durable. |

Saldo para apagar oversell: `GET /internal/v1/inventory/balances/{variant_id}` (200 con `available_quantity`).

Si `NO_STOCK`: el operador **no** reenvía la misma clave con `allow_oversell` cambiado. Quita o marca la línea y usa `bs:{ticket_id}:issue:{seq}`.

## Persistencia propia

Postgres (o equivalente) **en el runtime BlackStore**: tickets, líneas, intentos de stock (`operation_key`), pagos, sesiones de caja, diferencias de arqueo, lotes de factura, documentos de factura, cola de alertas oversell. Ver `data-model.md`. Ninguna de estas entidades existe en StoreCore.

## Oversell — apagado técnico

Job/consulta BlackStore lee tickets `oversell_committed` abiertos. Si el `available` StoreCore cubre la qty comprometida, setea `oversell_committed=false` y cierra la alerta (`CLEARED`). No `PATCH` a órdenes WEB. Escalamiento: `replenish_by` vencido sin cobertura → alerta `ESCALATED_MANAGER`; sin ack → `ESCALATED_OWNER`. StoreCore no persiste la cola.

**Cierre TBD-2:** BlackStore **consulta** `available` (GET de saldo por `variant_id` del hermano, o el `available_after` de un ISSUE/`DUPLICATE` posterior). No exige evento/outbox de StoreCore para apagar la alerta. Si el ingest agrega un evento más adelante, es opt-in; el mínimo es GET.

## Auth y secretos

Credencial de instalación StoreCore: referencia opaca. Operador USER BlackStore autentica en BlackStore. Roles mínimos: operador (ticket/caja), encargado (ack alerta), titular (escala final / arqueo). No mezclar con `CUSTOMER` StoreCore.

## Devolución post-factura (circuito aparte)

Si el ticket está facturado: **anotación, no diseño ARCA**. BlackStore abre devolución + NC según política titular/contador; **no** llama `REVERSAL`. El stock físico/reposición y el comprobante rectificativo no viajan a StoreCore. El discovery `20260921-arca-fiscal-discovery` cubre el circuito **online**, no este. Emitir NC presencial queda fuera de este spec.

## Conciliación

Informe BlackStore: Σ qty de ISSUEs netos (claves con `OK`/`DUPLICATE` de ISSUE menos reversos pre-factura) vs Σ qty de tickets que pidieron stock. Importes sólo en BlackStore (caja vs `CLOSED`; lote vs tickets del período).

## Gates

Pruebas futuras en runtime BlackStore: idempotencia, `NO_STOCK` todo-o-nada, popup, clave nueva de oversell, veto de `REVERSAL` post-factura, arqueo, lote=suma. Sin Sol GO de este feature y del hermano: no cliente productivo, no secretos, no DDL StoreCore.

## TBD

Ninguno de contrato HTTP. Fechas prometidas WEB/ML para el popup (`next_web_delivery_at`) viven como TBD-1/TBD-2 en `pos-sales-ingestion` (campos no están en `data-model-v1`); si vienen null con `oversell_allowed`, el popup usa el fallback de “sin fecha prometida”.
