# TASK-010 — Manual fulfillment and returns

**State:** complete. No carrier adapter.

## Evidence

- `POST /api/v1/user/orders/{id}/shipments` accepts PACKED→PREPARING, SHIPPED, DELIVERED with required timestamps. Invalid transitions reject.
- RMA `RECEIVED` → `INSPECTED` → `ADJUSTED` only. Restock/adjustment ledger happens on ADJUSTED after inspection, never before receipt.
- GATE: commerce fulfillment/RMA case. `mvn test` exit 0 on 2026-09-22.
