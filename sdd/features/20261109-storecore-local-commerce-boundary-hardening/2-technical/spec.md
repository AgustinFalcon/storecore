# Technical specification

## Authority and transaction design

`JdbcCartService.checkout` keeps completed-idempotency replay before any new catalog
decision. For a new claim it resolves identities without taking business locks, then
locks every distinct product in ascending numeric product id, every selected variant
in ascending numeric variant id, and finally inventory balances in ascending variant
id. Under the same transaction used by the authenticated mutation it translates
product and variant wire states into closed Kotlin types and requires sellability
before inserting the claim or reserving stock. The validated identity map is reused
by reservation and order-item writes; the code does not re-query by free SKU later.

Catalog writers and checkout use the same global product → variant → inventory-
balance order. Checkout reserves its validated lines in ascending variant id. A
concurrent archive or deactivation therefore completes before sellability is
evaluated or waits until checkout has consumed the active identity, without crossed-
product deadlocks. A reject occurs before every checkout effect. Price, discount,
offer and campaign remain the persisted cart snapshot; this feature deliberately
does not reprice.

Removal (`quantity <= 0`) is a separate command step: delete the cart-owned line by
cart id plus variant SKU without calling the active-product price lookup. A missing
line is an idempotent no-op. Add/update still requires the existing active price
authority.

Offer rows are translated with `DiscountKind.fromWire`; `discount()` owns the rule.
`Unknown` produces an explicit persistence/contract failure, not zero discount.

## Frontend translation and authorization

Add strict structural helpers for required records, strings, safe integers and money.
`mapCart` accepts an explicit `lines` array and currency; each line is validated.
`mapReceipt` requires a nonblank string order identity and required, nonblank string
`paymentStatus` and `orderStatus`. Missing, null, array, object, boolean and numeric
values are structural errors. Only future nonblank strings reach
`PaymentStatus.fromWire`/`OrderStatus.fromWire` and become closed `Unknown`; Unknown
never authorizes an action. Optional `checkoutUrl` is null or a string and keeps the
existing HTTPS/origin validation at its navigation boundary. The repository/store
surfaces translator failures through the existing retryable error phase. Checkout
state changes and key rotation occur only after a valid receipt.

`UserAction` remains a closed class. Its role sets are aligned to the backend policy:
Content and Mercado Libre accept only `UserRole.Admin`. Tests prove OPERATOR and
Unknown never receive those actions and that actor-generation changes cannot publish
stale navigation.

Overview links use the existing order identity; no new endpoint. Offers derive a
visible collection and distinguish installation-empty from filter-empty. The surface
manifest is reconciled to UI-reachable operations only; it must not enable an ML
writer merely because a repository method exists.

## Error contract

- Retired checkout: stable existing commerce validation envelope with a new local
  code `PRODUCT_NOT_SELLABLE`; no raw catalog state is echoed.
- Malformed inbound HTTP: frontend contract error in the existing error phase; no
  payload content is rendered.
- Unknown domain states remain closed `Unknown` and fail closed where authority is
  required.

## Verification

- PostgreSQL 16 HTTP/integration: product archived, variant inactive, mixed cart,
  retired removal, no-effect assertions, concurrent writer/checkout, two crossed
  multi-product carts proving the global lock order, and historical replay.
- Unit/domain: `DiscountKind` is the sole discount calculation path and Unknown
  rejects.
- Frontend mapper/store: malformed cart/lines/receipt, identity and money boundaries,
  idempotency key preserved and navigation absent on failure.
- Frontend role/view: ADMIN/OPERATOR/Unknown matrices, actor replacement, order deep
  links, filtered-empty offers and manifest assertions.
- Full backend, frontend, production build and browser acceptance; two independent
  GPT-6.1 Sol reviews on the exact head before merge.

## Explicit exclusions

No partial refund, CUSTOMER RMA command, variant authoring, stock-adjustment UI,
shipping quote, provider authentication, live marketplace write, fiscal adapter,
deployment or homologation is introduced here.
