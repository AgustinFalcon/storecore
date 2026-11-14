# Functional specification

## Outcome

When a customer confirms checkout, StoreCore durably records the local order,
payment, shipment, reservations, checkout claim, buyer/delivery snapshot and
rotated CSRF token before attempting any Mercado Pago network effect.

The response remains compatible: when Mercado Pago returns an allowlisted
checkout URL it is included; otherwise the already-created local order remains
`PENDING_PAYMENT` and can be retried/reconciled without creating a second local
order or a second logical payment attempt.

## Acceptance criteria

- The Mercado Pago create command runs with no active Spring transaction.
- A separate database connection can observe the local order and the durable
  checkout attempt before the remote create command starts.
- Cart/order/inventory locks are not retained during remote I/O.
- A remote exception after attempt preparation leaves one durable attempt with
  its original external reference and idempotency key.
- Repeating the same checkout intent reuses that attempt; it does not allocate
  a second attempt or a new remote idempotency key.
- The CSRF token still rotates exactly once with the successful local mutation.
- Existing closed payment/order/attempt types and current HTTP response remain
  unchanged. No raw wire status is introduced.
