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
- `FactState`: `Known`, `Unavailable`, `Unknown`.
- `UnavailableReason`: `SourceMissing`, `SourceContradictory`,
  `ExternalNotAvailable`, `Unknown`.
- `HomeBlockKind`: `Hero`, `CategoryRail`, `ProductRail`, `PromoBanner`,
  `Unknown`.
- `ProductStatus`: `Draft`, `Active`, `Archived`, `Unknown`.
- `CatalogSort`: `Relevance`, `NameAsc`, `PriceAsc`, `PriceDesc`, `Newest`,
  `Unknown`.
- `VariantAvailability`: `Available`, `OutOfStock`, `Unavailable`, `Unknown`.
- `InventoryBalanceState`: `Known`, `Missing`, `Unknown`.
- `OrderTimelineEventKind`: `OrderCreated`, `PaymentPending`,
  `PaymentAccredited`, `PaymentReversed`, `ShipmentPreparing`,
  `ShipmentShipped`, `ShipmentDelivered`, `ShipmentCancelled`,
  `ReturnOpened`, `ReturnResolved`, `Unknown`.
- `ReturnEligibility`: `Eligible`, `NotDelivered`, `AlreadyOpen`,
  `PaymentUnverified`, `Unavailable`, `Unknown`.
- `PricePolicyTransition`: `Activate`, `Pause`, `End`, `Unknown`.
- `ChannelState`: `Disabled`, `ReadOnly`, `Active`, `Paused`, `Error`,
  `Unknown`.
- `ObservationFreshness`: `Unverified`, `Unknown`.

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

### Productive data richness

The four PSD-T06 slices are sequential: A content, B catalog/inventory, C
orders/post-sale and D pricing/channels. A slice may reuse an existing endpoint
and table, but it may not widen the authority of that source or introduce an
external writer.

All collection contracts use the common shape
`Page<T>{items,page,size,total,truncated}`. `page` is zero-based, `size` is
positive and capped at 50, `total` is an exact non-negative count and
`truncated` is true when more authoritative rows exist outside the returned
page. Ordering includes a stable unique tie-breaker. Invalid closed filters or
sorts fail at the boundary; they are not passed to SQL as free-form values.

Facts that can be absent or contradictory use
`Fact<T>{state,value,reason}`. `KNOWN` requires a non-null value and null
reason. `UNAVAILABLE` requires null value and a closed reason. `UNKNOWN` is the
fail-closed result of an unrecognized wire state and cannot enable an action.

#### PSD-T06-A — Content (SC-SURF-01, SC-SURF-16)

`GET /api/v1/content/home` returns the public composition and
`GET /api/v1/user/content/home` returns the ADMIN composition. Their envelope
is `{revision,sections[]}` and each section is
`{key,kind,active,sortOrder,content,updatedAt}`. Public reads return only active,
known blocks in `sortOrder,key` order; ADMIN reads also return inactive and
unknown legacy blocks.

The exact typed content schemas are:

- `HERO`: `{title,body,ctaLabel?,ctaPath?}` where title is 1..120 characters,
  body is 0..500, optional ctaLabel is at most 80 and optional ctaPath is an
  internal absolute application route;
- `CATEGORY_RAIL`: `{title,categoryIds}` where title is 1..120 and categoryIds
  contains 1..12 unique existing local category identifiers;
- `PRODUCT_RAIL`: `{title,skus}` where title is 1..120 and skus contains 1..20
  unique existing local variant SKUs;
- `PROMO_BANNER`: `{title,body,ctaLabel?,ctaPath?}` where title is 1..120, body
  is 0..300, optional ctaLabel is at most 80 and optional ctaPath is an internal
  absolute application route.

`kind` is persisted inside the JSON object. For legacy rows, only
`section_key=hero` may translate to `HERO`, and only if its content validates
the full HERO schema. Every other row without kind maps to `Unknown`, remains
visible to ADMIN for diagnosis, is omitted from the public composition and has
editing disabled until an explicit valid replacement removes it.

`PUT /api/v1/user/content/home` is the single atomic `REPLACE` command with
`{expectedRevision,sections[]}`. An additive migration creates one singleton
home-composition revision row. The transaction locks it, compares
`expectedRevision`, validates the complete replacement, replaces the sections,
increments revision and writes a redacted audit event before commit. A stale
revision returns HTTP 409 and changes nothing. The mutation is ADMIN-only,
same-origin, USER-CSRF protected and executed through the existing mutation
coordinator.

Acceptance for A: no client default substitutes missing persisted content;
public/admin visibility follows the active/known and legacy rules above;
invalid schemas, external CTA paths, unknown kinds and stale concurrent
mutations fail closed; ordered reads, legacy translation, 409 rollback and
atomic replace/audit are covered against PostgreSQL.

#### PSD-T06-B — Catalog and inventory (SC-SURF-04, SC-SURF-05,
SC-SURF-17, SC-SURF-22)

Catalog projections preserve product identity/status, variants, attributes,
ordered media and price. `PriceProjection{base,original,effective,offer}` uses
the local base price and an offer fact only when locally authoritative.
Variant availability is derived from a distinct inventory fact; a missing
balance yields `UNAVAILABLE`, never quantity zero. The inventory projection is
`{variantId,sku,productName,variantLabel,available,reserved,onHand,safety,
saleable,updatedAt,state}`; quantities are null when state is `MISSING`.
Public reads exclude non-active products and variants. Administrative reads
retain their closed status and do not duplicate a product merely because it
has multiple variants.

The inventory formulas are fixed by the existing balance semantics:
`onHand = available + reserved` and
`saleable = max(available - safety, 0)` because `available` is already net of
active reservations. Availability precedence is: missing balance produces
`UNAVAILABLE`; unknown or invalid inputs produce `UNKNOWN`; otherwise positive
saleable produces `AVAILABLE` and zero saleable produces `OUT_OF_STOCK`.

Acceptance for B: public/admin lists and product detail are paged or bounded,
stably ordered and free of N+1 row loading; media/attribute order and variant
identity survive round-trip; missing inventory and known zero have different
wire/UI states; reserved and safety-stock cases prove both formulas and
availability boundaries; no external offer, stock or price is fabricated.

#### PSD-T06-C — Orders and post-sale (SC-SURF-13, SC-SURF-14,
SC-SURF-20, SC-SURF-21)

Order lists accept closed order/payment/shipment filters and return bounded,
stable pages. CUSTOMER reads remain customer-scoped; USER reads remain
role/capability-scoped. Detail exposes the locally stored header, lines,
delivery snapshot, totals and a typed timeline appropriate to the realm.
Historical buyer name or email is unavailable when the persisted buyer
snapshot did not capture it.

Payment success reuses the durable correlation rule established by PSD-T05:
commercial application, accredited attempt and payment must agree on order,
provider identity, amount and currency. Unresolved incidents, ambiguous
reversal evidence or contradictory correlation make payment-derived facts
`UNAVAILABLE`. Resolved reversal/refund/chargeback evidence excludes a payment
from successful fulfillment; rejected reversal evidence does not. Shipment and
return state are independently typed. Customer output never includes internal
actor names, raw audit payloads or unrestricted provider payloads.

`ReturnEligibility` is informational only in T06. Its precedence is:
unavailable or reversed payment authority produces `PAYMENT_UNVERIFIED`;
otherwise shipment other than `DELIVERED` produces `NOT_DELIVERED`; otherwise
any persisted return that is not definitively absent produces `ALREADY_OPEN`,
while an unavailable/unknown return read produces `UNAVAILABLE`; only valid
accredited payment, delivered shipment and definitive absence of a return
produce `ELIGIBLE`. T06 creates no CUSTOMER return command, right or return
window.

Acceptance for C: an orphan or crossed APPROVED payment never produces paid
UI; current valid evidence does; unresolved/resolved/rejected reversal cases
follow the closed rules; realm isolation, pagination, deterministic timeline
ordering and return eligibility have PostgreSQL/HTTP regressions.

#### PSD-T06-D — Pricing and channels (SC-SURF-19, SC-SURF-23)

Manual price policy responses project only persisted fields, including local
scope, currency, base/desired price, observed-price fact, effective promotional
price, status, window, writer and server-owned approval evidence. `priority` is
neither accepted nor returned because `channel_price_policies` has no authority
for it. Activation, pause and end are explicit transition objects; a client
cannot appoint its own approver or assign a generic state. Allowed transitions
are Draft→Active, Active→Paused/Ended and Paused→Active/Ended. Ended and Unknown
have no outgoing transition. Activate validates the server-time effective
window, absence of an overlapping active policy for the same listing/scope,
currency/scope and all price invariants, then records `approvedBy` and
`approvedAt` from server authority in the same transaction. Cost/margin is
unavailable until a local cost authority exists.

Mercado Libre account/listing reads keep account and listing state closed.
They expose desired local quantity/price separately from observed quantity and
price facts, plus manual-intervention and update metadata supported locally.
When an observed-price or observed-quantity column is non-null it is a stored
historical observation with `freshness=UNVERIFIED`; it is not asserted to be
current. A null observation is `UNAVAILABLE/EXTERNAL_NOT_AVAILABLE`; it is not
collapsed to zero or `DISABLED`. Entity `updated_at` is change time, never an
`observedAt` substitute. T06 defines no freshness TTL. A configured secret
reference proves neither authorization nor provider availability and is never
emitted. No OAuth call, listing mutation, competitor observation or other
external write is introduced by T06.

Acceptance for D: persisted window/approval and channel states survive
round-trip without client fabrication; priority input is rejected and never
exposed; transition/window/overlap rules are atomic; stored observations are
explicitly unverified and missing observations are unavailable; paged listing
reads remain bounded and deterministic; ADMIN/capability, same-origin,
USER-CSRF, audit and transactional mutation rules remain enforced.

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

