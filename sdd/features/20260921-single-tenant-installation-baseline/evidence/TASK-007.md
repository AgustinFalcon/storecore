# TASK-007 — WEB inventory authority

**State:** complete.

## Evidence

- Checkout writes one `reservation_saga_key` and one `reservation_line_key` per variant. Ledger `RESERVATION` / `SALE` / `RELEASE` use distinct `event_idempotency_key` values.
- `JdbcInventoryService.expireOverdue` locks overdue ACTIVE rows, appends RELEASE, updates balances, marks EXPIRED. Safety stock is enforced before reserve.
- Admin `GET /api/v1/user/inventory` returns available/reserved/safety. Ledger remains append-only.
- GATE: commerce integration inventory/expiry assertions. `mvn test` exit 0 on 2026-09-22.
