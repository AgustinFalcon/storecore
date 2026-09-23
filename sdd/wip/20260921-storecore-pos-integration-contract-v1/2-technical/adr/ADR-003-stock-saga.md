# ADR-003 — Saga reserve/commit/release y worker de expiry

**Status:** proposed for Sol · **Fecha:** 2026-09-21

## Decision

Mismas tablas WEB de stock. Channel `EXTERNAL_BLACKSTORE`. Event types `RESERVATION`/`RELEASE`/`STOCK_COMMIT_EXTERNAL`. Safety stock no perforable.

`available_quantity` ya es neta de `reserved_quantity`. Sellable = `GREATEST(0, available_quantity - safety_stock)`. No restar reserved otra vez.

Transiciones: reserve `available -= q, reserved += q`; commit `reserved -= q`; release/expiry `available += q, reserved -= q`.

Locks orden global: (1) fila de saga `FOR UPDATE`; (2) todos los balances `ORDER BY variant_id ASC`. All-or-nothing.

Tx-A: PENDING + hash COMMIT. Tx-B: lock saga, validar hash, locks, reserva+ledger+receipt+RESERVED.

D-TTL: 900s default (60–3600). Expiry worker 30s, batch 100, `FOR UPDATE SKIP LOCKED` sobre RESERVED vencidas. Cleanup PENDING > 60s sin ledger. Commit-vs-expire: lock de la fila de saga; el primero gana.

Reconcile: compare caller-supplied receipts; zero writes.

Purge (90d, AC-STK-8 / ADR-007): INSERT tombstone (`retention_until >= retired_at + 7 years`) → DELETE reservation lines → DELETE saga row, one transaction. GET tombstone without live row → 410 OPERATION_RETIRED (no re-POST). Incompatible command on a live terminal row → 409 OPERATION_STATE_CONFLICT.

409 CONFLICT: reserve keeps PENDING; commit/release keep prior durable state (not PENDING).

## Rejected

ISSUE/REVERSAL; oversell; apply de snapshots; `RESERVATION_RELEASE` como event_type (usar `RELEASE`); sellable = on_hand - reserved - safety (doble descuento).
