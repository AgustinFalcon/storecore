# Meta — POS sales ingestion (StoreCore)

- **Feature Name:** `pos-sales-ingestion`
- **Feature ID:** `feat-20260921-pos-sales-ingestion`
- **Feature UUID:** `a6fd4279-2190-4bbe-9bd4-827085c66145`
- **Status:** `superseded` (no approved; no GO)
- **Maturity:** superseded para companion BlackStore por `20260921-storecore-pos-integration-contract-v1`. No autoriza código.
- **Related:** ver `SUPERSEDED.md`. Baseline ledger intacto.
- **Mode:** standard · **Project type:** production · **Platform:** backend · **Language:** es
- **From backlog:** TODO-039

## Objective

Exponer en StoreCore un contrato de **consumo/reverso de inventario** para un sistema POS externo (BlackStore): asiento opaco `INVENTORY_ISSUE_EXTERNAL`, idempotencia, lock, proyección ML y `next_web_delivery_at`. No registrar ticket, precio, cobro ni factura presencial.

## Out of scope

Ticket, caja, popup, cola de alertas y facturación lote (viven en `20260921-blackstore-pos-operations`). Fiscal ARCA (discovery aparte). Baseline core 1.0.0 tasks.

## Stages

- functional: `superseded`
- technical: `superseded`
- tasks: `superseded`
- implementation: `blocked_superseded`
