# TASK-006 — Cart, checkout, payment inbox and orders

**State:** complete against the frontend HTTP contracts. No Mercado Pago browser SDK.

## Evidence

- Cart snapshots `originalUnitPrice`, discount, offer/campaign refs and `effectiveUnitPrice`. Checkout claims `(customer_id, checkout_idempotency_key)` with immutable snapshot; same hash replays the order, distinct hash conflicts.
- Customer `/api/v1/customer/orders` returns only that customer. Foreign order is 404. Admin `/api/v1/user/orders` is a separate USER path.
- `POST /api/v1/payments/mercadopago/notifications` persists `payment_event_inbox` before 200; replay is idempotent. No MP credential in the browser.
- GATE: `CommerceHttpIntegrationTest` cart/checkout/replay/orders/webhook cases. `mvn test` exit 0 on 2026-09-22.
