# Functional specification

## Problem

StoreCore has a complete 26-surface commercial Demo, while the productive
application exposes 22 routes with narrower data and no productive route for
recovery, favorites, offer administration or customer administration. A
successful Demo therefore proves the experience, not backend parity.

## Actors

- **CUSTOMER:** browses, maintains favorites and account data, checks out and
  reviews orders.
- **OPERATOR:** reads commercial work queues and permitted customer/order data.
- **ADMIN:** manages offers and the full local-commerce configuration.
- **Presenter:** loads a disposable installation with synthetic data through
  authenticated APIs and demonstrates the real Angular application.

## Requirements

### PSD-R01 — Executable coverage matrix

Every `SC-SURF-01..26` must declare its productive route, read contract, write
contracts, source of truth, data-loader stage and honest delivery state:
`REAL`, `DEMO_ONLY`, `EXTERNAL_BLOCKED` or `NOT_APPLICABLE`. Unknown delivery
state fails validation.

### PSD-R02 — No silent fixture fallback

The productive dependency graph must use HTTP repositories only. Loading,
empty, denied, unavailable and malformed-wire states are explicit. An API
failure never swaps in Demo data.

### PSD-R03 — Customer favorites

An authenticated CUSTOMER can list, add and remove favorites by canonical SKU.
Adding an inactive, missing or unknown product fails closed. A previously
favorited product that later becomes inactive remains visible as unavailable
and can still be removed. Replays return an explicit idempotent outcome and one
customer never reads or mutates another customer's list. `FAVORITES` must be
promoted from future-optional by this feature; `READ_ONLY` permits listing and
`ACTIVE` permits listing plus mutations.

### PSD-R04 — Local offer administration

ADMIN can list, create and transition local WEB offers using the existing
`offers` and `offer_products` source of truth. Status, discount kind and
transition are closed types. Invalid windows, empty product scope, unknown SKUs
and invalid discount values are rejected atomically. Multiple eligible offers
are allowed and the deterministic winner remains highest priority then lowest
id. StoreCore has no authoritative cost basis in this phase, so a non-zero
minimum-margin rule fails closed as `COST_BASIS_UNAVAILABLE`; the backend never
pretends to validate margin. This is not an ML price writer or campaign
communication system.

### PSD-R05 — Customer administration

Authorized USER roles can search and inspect the minimum customer data needed
for service: identity summary, account state, order count and last order date.
ADMIN alone may change the account state. Password hashes, session tokens and
unnecessary address detail are never returned.

ADMIN and OPERATOR may read list/detail. The projection is limited to id, name,
email, phone, account state, creation date, order count and last order date.
Only ADMIN may suspend or reactivate. Suspension, revocation of every active
CUSTOMER session and the audit event commit or roll back together.

### PSD-R06 — Operator overview

The productive dashboard receives correlated metrics and current work queues
from an authenticated read model derived from orders, payments, inventory,
customers and capabilities. Unknown or incomplete facts are exposed as such;
the backend does not invent revenue, payment success or stock health.

ADMIN and OPERATOR may read the same non-PII aggregate. Periods are `TODAY`,
`LAST_7_DAYS` and `LAST_30_DAYS` in the installation timezone. Revenue counts
orders with an authoritative `APPROVED` payment and excludes refunded,
cancelled and charged-back payments. The queues are pending-payment orders,
paid orders without a terminal shipment and variants whose available stock is
at or below safety stock.

### PSD-R07 — Productive data richness

Existing productive home, catalog, order, inventory, promotion and Mercado
Libre screens receive all fields supported by their current local source of
truth. Fields that require an external provider remain unavailable with an
explicit delivery state, not fabricated sample values.

The work is delivered as four sequential slices so that each authority and
failure boundary can be reviewed independently:

1. **PSD-T06-A — Content (SC-SURF-01, SC-SURF-16).** Public home content is
   restricted to active, ordered blocks. ADMIN may inspect active and inactive
   blocks and atomically replace the composition with typed content. A missing
   configured value is not replaced with a brand, banner or marketing sentence
   invented by the client. Legacy `hero` content may be translated only when it
   validates as a hero; every other legacy block without a kind remains
   admin-visible but is omitted publicly and cannot be edited as a known kind.
   A composition contains at most 100 blocks across direct replacement and
   cumulative profile merges, so a public read cannot amplify an unbounded set
   of catalog references.
2. **PSD-T06-B — Catalog and inventory (SC-SURF-04, SC-SURF-05,
   SC-SURF-17, SC-SURF-22).** Public and administrative catalog projections
   expose the locally stored product, variant, attribute, media, price and
   inventory facts needed by their screens. Missing inventory is distinct from
   a known zero balance. Lists are paged, ordered and bounded.
3. **PSD-T06-C — Orders and post-sale (SC-SURF-13, SC-SURF-14,
   SC-SURF-20, SC-SURF-21).** CUSTOMER and USER receive realm-appropriate,
   paged order projections. Payment and fulfillment labels are based on
   correlated durable evidence; a raw or orphan provider row cannot become a
   successful payment. Timeline and return eligibility expose explicit unknown
   or unavailable states and never leak internal actor or audit payloads.
4. **PSD-T06-D — Pricing and channels (SC-SURF-19, SC-SURF-23).** Manual
   price policies expose values actually stored by the local authority and use
   explicit transitions. Mercado Libre account/listing projections distinguish
   desired local state from observed external state. The absence of an
   observation is unavailable, not zero, disabled or synchronized.

Content replacement uses optimistic composition revision: the ADMIN submits
the revision that was read, and a concurrent replacement produces conflict
rather than overwriting it. Price-policy approval belongs to the server; a
client cannot nominate an approver. Locally stored channel observations are
historical but have no verified observation time, so their freshness remains
unverified and they are never described as the provider's current value.

Across all four slices, finite states enter through one closed translator.
Unknown wire values fail closed. Collection responses expose an exact total
and whether the returned page is truncated; they never materialize an
unbounded table or silently present the first rows as the whole result.

The local database cannot establish live carrier position or ETA, remote
provider health, Mercado Libre fees/rank/competitor data, current external
price or stock when no observation exists, product margin without a cost
authority, or buyer name/email that was not captured in the historical order
snapshot. Those facts remain explicitly unavailable. OAuth secret references
and provider credentials are never returned to a screen.

### PSD-R08 — Recovery boundary

Recovery remains `EXTERNAL_BLOCKED` until a separate security-approved email
delivery contract exists. The productive login may explain that limitation,
but this feature does not create plaintext tokens, reveal account existence or
pretend that an email was sent.

### PSD-R09 — Real showcase loader

The loopback-only loader creates or reuses synthetic favorites, offers and
customer/order data through the same APIs used by Angular. Replays preserve
operator changes and external integrations remain disabled.

## Acceptance

1. The manifest records current and target coverage per operation and field; a
   route alone never marks a surface complete. Recovery is the only
   provider-blocked surface in this WIP.
2. Favorites, offers, customer administration and overview pass real
   PostgreSQL/Spring/Angular browser journeys.
3. Production bundles cannot import Demo repositories or seeds.
4. CUSTOMER/USER cookies, CSRF and authorization remain separate.
5. No external provider, fiscal document, carrier label or competitor signal
   is activated or simulated as authoritative.
6. PSD-T06-A through PSD-T06-D pass their own local-authority, closed-state,
   unavailable-fact and bounded-collection acceptance before productive
   richness is declared complete.

