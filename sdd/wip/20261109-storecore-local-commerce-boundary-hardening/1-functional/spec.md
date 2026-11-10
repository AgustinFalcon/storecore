# Functional specification

## Checkout sellability

- LCBH-R01 — A new checkout may reserve only a product whose product state is
  `ACTIVE` and whose selected variant is active at the checkout boundary.
- LCBH-R02 — If any cart line is no longer sellable, checkout fails as one operation:
  no claim, order, payment, shipment, reservation or inventory-ledger effect is
  created. The cart and its price snapshots remain available for correction.
- LCBH-R03 — A customer can remove a line from their own cart even after its product
  or variant is retired. Removal is idempotent and does not require repricing.
- LCBH-R04 — A previously completed idempotent checkout replays its durable receipt
  after later catalog retirement. Retirement never rewrites historical evidence.
- LCBH-R05 — Offer discount calculation uses the existing closed `DiscountKind`.
  An unknown stored kind fails closed; infrastructure does not duplicate string
  switches or discount rules.

## Productive HTTP and navigation boundaries

- LCBH-R06 — A structurally valid empty cart is distinct from a malformed response.
  Every cart line requires a nonblank SKU/name, positive integer quantity and finite,
  nonnegative coherent money fields. Unknown finite statuses remain `Unknown`; absent
  commercial identity or numeric facts are contract errors, never fabricated zeroes.
- LCBH-R07 — A checkout receipt requires a nonblank string order identity and
  nonblank string `paymentStatus`/`orderStatus`. Missing, null, array, object,
  boolean or numeric status fields are malformed; only a nonblank future string is
  translated to closed `Unknown`. A malformed response does not rotate the
  idempotency key, does not navigate and publishes an honest retryable error.
- LCBH-R08 — USER navigation is derived from the same closed role policy enforced by
  stores and backend. Content and Mercado Libre are ADMIN-only; OPERATOR is not
  offered an action that must be denied.
- LCBH-R09 — Operational overview rows link directly to their order. An offer filter
  with zero matches renders a distinct empty-filter state and a clear-filter action.
- LCBH-R10 — The productive surface manifest lists operations actually reachable
  from each UI surface and distinguishes available backend commands from UI actions.

## Acceptance scenarios

1. Add an active SKU, archive its product, then checkout: stable unavailable error;
   all checkout/inventory effect tables remain unchanged and the cart remains.
2. Repeat with only the variant disabled and with a mixed valid/retired cart; neither
   case produces partial effects.
3. Remove the retired line successfully, then checkout the remaining sellable lines.
4. Complete checkout, retire its SKU and replay the same idempotency key: receive the
   original order result without a new sellability decision.
5. Concurrent catalog retirement and checkout serialize so the result is either a
   completed order for the still-active locked identity or a clean no-effect reject.
   Two carts whose variants cross the same two products complete without deadlock.
6. Unknown discount kind never yields an implicit zero discount.
7. Malformed cart and receipt payloads fail translation. Receipt failure preserves
   the current checkout key and route. Future nonblank status strings become
   `Unknown`; non-string or blank statuses are structural errors.
8. OPERATOR home/navigation omits Content and Mercado Libre, including after an actor
   or role replacement; direct routes remain fail-closed.
9. Overview queue rows navigate to their exact order; a no-match offers filter is
   announced and can be cleared.
