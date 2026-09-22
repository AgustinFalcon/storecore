# Contexto cerrado — HISTÓRICO (no es spec viva)

> **NO IMPLEMENTAR.** Este archivo describe el protocolo ISSUE/REVERSAL/`allow_oversell` **superseded**. Companion vivo: BlackStore `sdd/wip/20260921-blackstore-pilot/`. Contrato vivo: StoreCore `storecore-pos-integration-contract-v1` (YAML canónico). El cruce vigente es reserve/commit/release/GET/reconcile, no ISSUE.

Paquete de negocio cerrado 2026-09-21. Conservado sólo como evidencia.

## Invariante

Ventas StoreCore = WEB + ML. Ventas BlackStore = mostrador. Cruce = cantidades, nunca importes.

## Este feature (BlackStore, sistema externo)

BlackStore es **otro** runtime. Este WIP vive en el repo StoreCore solo como contrato del POS externo (igual que el discovery fiscal). **Cero tablas de ticket en PostgreSQL de StoreCore.**

### Ticket

Líneas: `variant_id` (el de catálogo StoreCore) + qty > 0 + precio snapshot local (puede diferir del web).

Estados:

| Situación | Estado |
|---|---|
| StoreCore `OK` | `CLOSED` |
| StoreCore `NO_STOCK`, operador espera | `PENDING_STOCK` |
| Oversell confirmado | `CLOSED` + `oversell_committed=true` + `replenish_by=next_web_delivery_at` |
| Operador cancela | `CANCELLED` |
| Anulado pre-factura | `CANCELLED` + llama `REVERSAL` a StoreCore |
| Anulado post-factura | Devolución + NC. **No** llama REVERSAL |

Reglas: no cerrar sin líneas; `CLOSED` inmutable (corrección = NC / ticket nuevo); máximo un ISSUE exitoso por ticket; persistir intención **antes** de llamar a StoreCore.

### Flujo

1. Persistir `PENDING_STOCK`.
2. `POST` consumo StoreCore (contrato en `20260921-pos-sales-ingestion`).
3. Si `NO_STOCK` y `oversell_allowed`: popup — "Las ventas online acapararon este producto. Entrega web/ML más próxima: \<next_web_delivery_at\>. Podés venderlo ahora y reponer antes de esa fecha."
4. Si acepta: **nueva** `operation_key` con `allow_oversell: true` en esa línea.
5. Si rechaza: `CANCELLED` o queda `PENDING_STOCK`.
6. Facturar en circuito BlackStore (ticket / día / lote / a mano). Régimen: titular/contador. El lote cierra contra tickets del período.

Caja: cobros del turno vs tickets `CLOSED`; diferencia se registra.

### Oversell / alertas

Cola de tickets `oversell_committed` pendientes de reposición. Al vencer `replenish_by` sin stock, escala a encargado; si no hay, titular. El sistema avisa, **no** atrasa/cancela la orden web. StoreCore no conoce la alerta.

Apagado: BlackStore consulta stock StoreCore (o evento); si `available` cubre, cierra el compromiso.

### Reverso

BlackStore **no llama** REVERSAL si el ticket ya está facturado. StoreCore no sabe de factura.

### Conciliación

Σ qty ISSUE netas de reversal en StoreCore = Σ qty tickets BlackStore que pidieron stock.

No implementación. No DDL StoreCore. No mezclar con `pos-sales-ingestion` ni con el baseline.
