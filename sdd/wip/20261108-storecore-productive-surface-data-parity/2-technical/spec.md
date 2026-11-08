# Technical specification

## Architecture

Each vertical preserves:

`Angular view -> store/use case -> port -> HTTP repository -> controller -> application service -> output port -> PostgreSQL adapter`.

Domain and application code do not import Angular, Spring, HTTP or JDBC.
Controllers translate one wire representation into closed domain values. The
view consumes labels and rules from those values and never compares literals.

## Closed types

- `SurfaceDeliveryState`: `Real`, `DemoOnly`, `ExternalBlocked`,
  `NotApplicable`, `Unknown`.
- `FavoriteMutation`: `Add`, `Remove`, `Unknown`.
- `OfferStatus`: `Draft`, `Active`, `Paused`, `Ended`, `Unknown`.
- `DiscountKind`: `Percent`, `Fixed`, `Unknown`.
- `CustomerAccountState`: `Active`, `Suspended`, `Unknown`.
- `OverviewFactState`: `Known`, `Unavailable`, `Unknown`.
- `OverviewUnavailableReason`: `PaymentFactsIncomplete`,
  `ShipmentFactsIncomplete`, `InventoryFactsIncomplete`, `Unknown`.
- `FavoriteAvailability`: `Available`, `Unavailable`, `Unknown`.
- `FavoriteMutationOutcome`: `Added`, `AlreadyPresent`, `Removed`,
  `AlreadyAbsent`, `LimitReached`, `Unknown`.
- `OfferTransition`: explicit `Activate`, `Pause`, `End`, `Unknown` step
  objects; no generic status assignment.
- `OverviewPeriod`: `Today`, `Last7Days`, `Last30Days`, `Unknown`.

Kotlin uses `enum`/sealed types. TypeScript uses private constructors, static
instances and a single `fromWire`. Wire values enter through one mapper per
aggregate.

## Contracts

### Favorites

- `GET /api/v1/customer/favorites`
- `PUT /api/v1/customer/favorites/{sku}`
- `DELETE /api/v1/customer/favorites/{sku}`

Writes require same-origin CUSTOMER CSRF. A forward-only migration creates a
unique `(customer_id, variant_id)` relation with timestamps and restrictive
foreign keys. It also promotes the existing `FAVORITES` module from
future-optional, adds an explicit `READ` action and a `customer_allowed`
capability-action attribute. `CapabilityActor.Customer` is accepted only when
that attribute is true. GET decides `FAVORITES/READ`; PUT and DELETE decide
`FAVORITES/MANAGE`. DISABLED/PAUSED/ERROR deny all; READ_ONLY permits only GET;
ACTIVE permits all three; a live action kill switch always wins.

`GET` returns at most 200 `FavoriteItem` values ordered by `addedAt DESC, sku`:
`{sku,name,price,imageUrl,availability,addedAt}`. An inactive product remains
with `availability=UNAVAILABLE`. `PUT` returns
`{sku,outcome:ADDED|ALREADY_PRESENT}` and rejects an inactive or missing SKU as
the same non-disclosing `PRODUCT_NOT_AVAILABLE`. A customer may own at most 200
favorite relations. PUT locks that customer before count/insert; replay of an
existing favorite remains `ALREADY_PRESENT`, while a new relation at the limit
returns conflict with the closed `LIMIT_REACHED` outcome. `DELETE` returns
`{sku,outcome:REMOVED|ALREADY_ABSENT}` so replay is observable and idempotent.
Unknown wire availability/outcome maps to `Unknown` in Angular and never gains
an enabled action.

### Offers

- `GET /api/v1/user/offers`
- `POST /api/v1/user/offers`
- `POST /api/v1/user/offers/{id}/state`

ADMIN authority and `MANUAL_PROMOTIONS` capability are mandatory. State
changes are explicit transition objects; no generic status setter exists. Both
POST operations require USER same-origin, USER CSRF validation/rotation and the
existing transactional mutation coordinator; a CUSTOMER token is never valid.
Create accepts `{name,priority,startsAt,endsAt,discountKind,discountValue,
minMarginPercent,skus[]}`. Until a cost authority exists,
`minMarginPercent` must be zero. Percent discount is `(0,100]`; fixed discount
is positive and may not exceed any scoped product base price. `Activate` locks
the offer and scoped products, records the current ADMIN as approver and uses
the deterministic winner `priority DESC, id ASC`. Allowed transitions are
Draft→Active/Ended, Active→Paused/Ended, Paused→Active/Ended; Ended is terminal.

### Customers

- `GET /api/v1/user/customers?query=&state=&page=`
- `GET /api/v1/user/customers/{id}`
- `POST /api/v1/user/customers/{id}/state`

Reads expose a purpose-limited projection. State mutation is ADMIN-only,
same-origin and CSRF protected. Session revocation after suspension uses the
existing identity-session authority in one database transaction. Search query
is blank or 2..100 characters; page size defaults to 25 and is capped at 100.
ADMIN and OPERATOR may read. The wire projection is
`{id,firstName,lastName,email,phone,state,createdAt,orderCount,lastOrderAt}`;
no address, password/session material or raw audit payload is returned.
Suspension acquires a customer row `FOR UPDATE`, changes account state, revokes
all active CUSTOMER sessions and appends the audit event before commit. Login
and suspension use compatible row locks so concurrent issuance cannot survive
the suspension. Reactivation never revives an old session; a new login is
required. Tests cover rollback after each intermediate step and login races.

### Overview

- `GET /api/v1/user/overview?period=`

`OverviewPeriod` is a closed type with TODAY, LAST_7_DAYS and LAST_30_DAYS.
Boundaries use `installation_settings.timezone`; an invalid timezone fails the
read. ADMIN and OPERATOR can read the same aggregate and no CUSTOMER/PII is
accepted. The response contains fact wrappers for accredited revenue, order
count, active customer count and inventory-at-risk plus three typed work
queues: pending-payment orders, paid orders without terminal shipment and
variants at/below safety stock. Accredited revenue includes an order once only
when its authoritative payment is APPROVED and excludes REFUNDED,
CHARGED_BACK, CANCELLED and unknown payment states. Missing or contradictory
facts produce `UNAVAILABLE` with no numeric value, never zero.

Each work queue is a bounded projection, never an unbounded historical load.
`KNOWN` queues expose `totalCount`, at most 50 `items` in deterministic
attention order and `truncated = totalCount > items.length`; `UNAVAILABLE`
queues expose `totalCount = null`, `items = []`, `truncated = false` and a
non-empty reason. Counts and contradiction checks are derived with SQL
aggregates, not by loading every candidate or building one bind parameter per
row. The UI names a truncated result explicitly instead of presenting it as a
complete queue.

## Angular routing

Add productive routes for `/customer/favorites`, `/user/offers` and
`/user/customers`. Recovery remains absent and is reported by the delivery
matrix as `EXTERNAL_BLOCKED`. Navigation is derived from realm, role and
capability types; it never relies on labels.

## Coverage manifest

`surface-data-manifest.json` is validated by a deterministic test. Every
surface identity appears exactly once. Current route ownership, controller
endpoint declarations, loader stage names and delivery state must agree with
the executable sources. HTTP repository binding and per-field parity are
implemented and tested by their owning PSD-T02..T06 vertical rather than
overclaimed by PSD-T01.
Each entry also records `coverage` and task owner, so `REAL` means a real route
exists while `LIMITED` remains an explicit residual rather than full parity.

## Migration and compatibility

Only additive, forward migrations are allowed. Existing V1-V11 checksums are
preserved. Clean install and V11 upgrade gates run on PostgreSQL 16. Unknown
wire states fail closed without rewriting historical rows.

## Showcase data

The API-driven loader gains ordered step objects after the existing catalog,
customer and order stages. It creates only synthetic `.invalid` identities and
`SHOW-*` SKUs, verifies readback, and never overwrites an existing unrelated
offer or favorite.

## Security and observability

- no PII or secrets in logs, evidence or fixtures;
- query length, page size and mutation body limits are explicit;
- all USER mutations write audit events with redacted payloads;
- error responses do not disclose cross-customer identifiers;
- external integrations remain fail-closed.

## Review protocol

Each independently reviewable vertical receives two GPT-6.1 Sol reviews in
parallel over the same base/head diff. Evidence records provider, model,
effort, base/head SHA, executed checks and limitations. Any code change
invalidates both approvals and requires both reviews again. Close-out never
claims CI, browser evidence or external homologation that did not run.

