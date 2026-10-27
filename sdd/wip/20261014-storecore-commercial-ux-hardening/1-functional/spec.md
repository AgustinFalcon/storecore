# Functional Specification — StoreCore commercial frontend completion

## Document status

- State: approved by the user; senior-review amendments incorporated before task generation.
- Scope: StoreCore first. BlackStore remains a separate product.
- Goal: a commercially presentable, internally coherent frontend whose visible actions work with typed simulated data before every backend capability is connected.
- Prior completion claims in this WIP are superseded by the strict audit performed on 2026-10-14.

## Problem

The current demo proves several flows but not a complete product. Production and demo use different implementations; preserved evidence covers only 20 surfaces; one of 25 automated demo surfaces was not fully exercised; and strict reviews found one P1 plus multiple P2 consistency gaps.

The product needs one contract for every surface, role, state, action, effect and evidence item. A simulated flow must be useful for selling the product without being presented as a real payment, invoice, marketplace synchronization or shipment.

## Product principles

1. StoreCore is the operating system of one merchant installation.
2. Visitors understand what is sold and reach products from the first viewport.
3. Customers can answer what they buy, how much it costs, how they receive it and what happens next.
4. Operators can answer what needs attention, who the customer is, the next valid action and how inventory reconciles.
5. Data is specific and consistent. The UI does not invent reviews, sales, coverage, installments, guarantees or provider approval.
6. A mock is always identified as simulation and never certifies integration or homologation.
7. Design approved, demo approved, integration-ready, integrated and homologated are distinct delivery states.

## Personas and authority

- Visitor: browses public content and begins a purchase.
- Customer: manages personal data, cart, checkout, orders and post-sale.
- Operator: manages daily catalog, order and inventory operations allowed by role.
- Administrator: manages configuration, capabilities, content, campaigns and customers.
- Reviewer: validates design, behavior and evidence without operational authority.

Unknown or unsupported roles grant no privileged action and show a safe access-denied state.

## Delivery-state vocabulary

- Design approved: responsive prototypes and state contracts were approved before code changes.
- Demo approved: the Angular demo executes the simulated flow and identifies simulation.
- Integration-ready: real route and boundary contract exist, but a provider is not active.
- Integrated: authoritative data is exchanged with an enabled provider.
- Homologated: provider acceptance evidence exists for the intended account/environment.

No lower state may use a higher-state label.

## Benchmark-derived requirements

- Search, categories and help/post-sale remain easy to locate.
- Catalog shows query, count, removable filters, ordering and return context.
- Product detail groups price, variant, stock, delivery/pickup, payment choices and warranty near the CTA; specifications follow below.
- Cart feedback appears at the action point and separates merchandise subtotal from delivery pending calculation.
- Authentication preserves purchase intent.
- Checkout exposes clear progress, editable review and approved, pending, rejected, cancelled and error outcomes.
- Orders show product, date, state and next action; customer views never receive internal inventory/channel alerts.
- Backoffice prioritizes work and shows customer, contact, modality, state and next action.

Sponsored sellers, memberships, fabricated reviews/sales and unsupported delivery promises are out of scope.

## Surface inventory and acceptance matrix

Each surface must record role, target (`demo`, `real` or both), fixture, closed state, visible actions, expected effect, persistence/reload expectation and evidence. The authoritative assignment is `delivery-manifest.json`; no target may remain implicit at G0.

### Public surfaces

#### SC-SURF-01 — Home

- Content: proposition, one primary campaign, categories, sample product photography, offers and trust/help.
- States: populated, empty catalog, scheduled/no active campaign, mobile menu, loading and recoverable error.
- Actions: search, category, product, offer, account and help.
- Acceptance: first viewport identifies the business and exposes product discovery without a giant empty hero.

#### SC-SURF-02 — Unified login

- States: idle, submitting, invalid credentials, customer, operator, ambiguous-context challenge, expired challenge, access denied and service error.
- Acceptance: customer resumes a safe purchase destination; internal user reaches the correct administrative home. Sessions and permissions remain separate.

#### SC-SURF-03 — Account recovery

- States: request, submitting, sent, invalid/expired/used token, completed and service error.
- Acceptance: it does not reveal whether arbitrary email exists and restores a safe destination when appropriate.

#### SC-SURF-04 — Catalog and search

- Content: query, count, category/brand/stock/price filters, removable chips, order and pagination.
- States: populated, empty, loading, error, offer, out of stock, mobile filter drawer and restored return context.
- Acceptance: product round-trip preserves query, filters, order and page; no numeric filter appears as ambiguous zero. Future Outlet is an explicit condition filter and disclosed collection, not generic discounted stock.

#### SC-SURF-05 — Product detail

- Content: honest gallery, price, variant, quantity, stock, delivery/pickup, payment choices, optional warranty, highlights, specifications and help.
- States: available, low stock, unavailable, missing optional data, one/multiple variants, zoom, add confirmation and stale conflict.
- Acceptance: card, detail, cart and checkout agree on product, variant, effective price and availability. An Outlet unit/lot uses this route with real-item media, condition, defects and warranty visible before the CTA.

#### SC-SURF-06 — Customer registration

- States: empty, validation, submitting, duplicate identity, success and error.
- Acceptance: purchase product, variant, quantity and destination survive registration.

### Customer surfaces

#### SC-SURF-07 — Profile

- Supports personal data and password update with validation, success and failure feedback.

#### SC-SURF-08 — Addresses

- States: list, empty, create, edit, invalid, primary, delete confirmation and blocked deletion.
- Acceptance: checkout consumes the selected valid address without duplication or loss.

#### SC-SURF-09 — Favorites

- States: populated, empty, unavailable product, removed product and add-to-cart eligibility.

#### SC-SURF-10 — Cart

- Actions: quantity, remove, undo and continue/checkout.
- States: populated, empty, last unit, invalid quantity, unavailable item, expired offer and changed-price review.
- Acceptance: feedback is adjacent to the item and totals reconcile.

#### SC-SURF-11 — Checkout

- Steps: destination, delivery, payment and editable review.
- Modalities: home delivery and pickup.
- Demo payment choices: card-like checkout, QR simulation and transfer simulation. Future wallet connectors reuse the selector but remain individually disclosed simulations until integrated.
- States: ready, processing, pending, cancelled, rejected, recoverable error, stock conflict and module unavailable.
- Acceptance: total stays visible; steps are reversible; fulfillment cannot advance before an eligible payment state.

#### SC-SURF-12 — Checkout result

- States: approved, pending, rejected, cancelled, error, no stock and missing order.
- Acceptance: explains what happened, what did not and the next action. Redirect or QR display is never proof of payment.

#### SC-SURF-13 — Customer order list

- Shows product, authoritative date, payment, fulfillment and next action.
- States: populated, empty, filtered, pending and terminal.
- Acceptance: chronological sort uses date, not identifier.

#### SC-SURF-14 — Customer order detail and post-sale

- Shows payment, fulfillment, destination, applicable tracking, receipt status, timeline and customer-safe alerts.
- Post-sale: eligible quantity, partial request, submitted, review, approved, rejected, received, refunded and closed.
- Acceptance: cancelled/rejected payment cannot pair with preparing shipment; pickup has no postal tracking. Receipt/fiscal state remains explicitly non-fiscal until the external ARCA feature is homologated.

### Administrative surfaces

#### SC-SURF-15 — Dashboard

- Shows period-bound fixture metrics, work queues, unresolved incidents and shortcuts.
- States: active, empty, urgent alerts and no data.
- Acceptance: incident shortcuts open incident context, not an unrelated payment filter.

#### SC-SURF-16 — Store content

- Supports copy, banners, categories and actual preview.
- States: editing, validation, unsaved, saving, success and failure.
- Saving persists a draft; it does not claim that the content was published. The current Real contract is limited to `title`, `body` and optional `blocks { id, title, body }`. Rich banner/category controls are explicitly Demo-only until a productive field and command exist.
- Admin and Operator may access the surface. Preview renders the SC-SURF-01 composition with the edited draft; leaving with unsaved changes requires explicit discard.

#### SC-SURF-17 — Product administration

- Supports list/filter/page, create/edit, media, variants, activation, preview and archive.
- States: list, empty, editor, validation/persistence failure, conflict and success.
- Acceptance: `originalListPrice >= currentBasePrice` for every variant before promotions; `effectivePrice` is derived. With base 100, offer 20% and original 90, save is rejected without mutation. A published product requires at least one valid active variant, but that variant may have zero availability; exhaustion does not invalidate the catalog. All variants disabled is rejected. Archiving preserves variants, stock and history. Persisted snapshots decode after reload. Outlet condition is edited per unit/lot, not as a generic tag.
- Admin and Operator may access the surface. The current Real product contract does not expose original list price, per-variant activation or Outlet unit/lot fields; those specimens and commands remain explicitly Demo-only. An incomplete product remains an unsaved form because no product-draft persistence contract exists.

#### SC-SURF-18 — Offers

- States: draft, scheduled, active, paused, expired and invalid.
- Acceptance: projected and currently applied prices are distinct.
- Admin and Operator may access the Demo surface, which shows the complete lifecycle. SC-SURF-18 has no productive route, port or HTTP repository in the reviewed SHA; every Real read/write capability remains deferred to its owning contract cut. Demo behavior never implies productive persistence.

#### SC-SURF-19 — Campaigns

- Supports list, editor, product scope, window, preview and status transitions.
- States: current, scheduled, paused, expired, invalid and persistence failure.
- Only Admin may access the surface; Operator receives access denied. In Real this surface manages the existing manual promotion contract for one SKU, currency, validity window, priority, margin and approval metadata. Multi-product scope, richer lifecycle controls and commercial preview are Demo-only and never imply audiences, messaging or external publication.

#### Shared commercial fixture and price policy

- Demo reference clock: `2026-10-15T12:00:00-03:00`, zone `America/Argentina/Buenos_Aires`. All scheduled/current/expired specimens derive from that clock.
- Canonical examples: offers `OFF-DEMO-001..006`; campaigns `CMP-DEMO-001..006`; all reference canonical storefront SKUs. Scenario alternatives never mutate the approved baseline fixture.
- The approved storefront baseline remains authoritative: `DEMO-001/kit-completo` has base and currently applied price `$198.800 ARS`, sellable availability `5` and pickup not configured; `DEMO-001/bare-tool` is `$124.000 ARS`. `OFF-DEMO-001` is scheduled at 20%, so `$159.040 ARS` is projected only and is not displayed as the current price before its window.
- `VLD-043` is an Outlet unit/lot example with current/base Outlet price `$71.900 ARS` and separate original/comparator `$95.000 ARS`; it has no promotional percentage or active offer in the baseline.
- Offer eligibility requires a valid interval, applicable SKU, evaluable price inputs and satisfied minimum-margin data. Missing inputs render `No evaluable` and never auto-apply.
- Eligible offers do not stack. Winner order is: greatest numeric priority, then greatest valid discount that respects the declared price floor, then latest `startsAt`, then stable ID ascending.
- A manual campaign/promotion is a separate merchandising/manual-approval record and does not add a second discount to the storefront offer price. Its preview names the single price source.
- End before start is invalid. Unknown lifecycle values render `Estado desconocido` and restrict mutation.

#### SC-SURF-20 — Administrative order list

- Admin and Operator see one prioritized work queue. Search and filters operate only on fields present for the selected target; active filters, result count and reset remain visible.
- Demo shows buyer, contact, date, payment, modality, fulfillment, incident, historical total and next valid action. Real shows only the existing `AdminOrder` read model; buyer, contact, date, modality, address and chronology are omitted or explicitly unavailable, never inferred from IDs.
- Order, payment, shipment and incident are separate closed facts. Unknown blocks mutation and never renders raw wire text. Current promotions never recalculate a historical order line.
- Selection and export are Demo-only information workflows and never imply a bulk state mutation or fiscal export. Each supported transition names the entity, precondition and effect before confirmation.
- States: populated, filtered, empty, filter-no-results, payment pending, incident, resolved alert, loading, error, access denied and Unknown.

#### SC-SURF-21 — Administrative order detail

- The page title is `Pedido #…`; preparation is a contextual action, not a universal title. It shows historical lines/prices, independent payment/order/shipment/RMA facts and exactly one next valid action.
- Demo may show payment, home-delivery/pickup, incident, partial-return, damaged-return, refund and non-fiscal receipt specimens only with explicit before/after effects. Receiving, inspecting, stock disposition and refund are distinct steps. A partial refund keeps the payment approved and shows a separate closed partial-refund state/amount; it never labels the whole payment as refunded.
- Real permits only the existing shipment commands `PACKED`, `SHIPPED`, `DELIVERED` and the whole-order RMA command `RECEIVED`. Only `SHIPPED` requires tracking; `DELIVERED` preserves an existing code. `READY_PICKUP` is not part of the current closed frontend type: the single wire translator maps it to `Unknown`, it is not presented as a valid Real state and exposes no CTA. Real cannot inspect/adjust an RMA, mutate payment, issue labels/invoices/refunds, resolve incidents or promise partial/damaged-return controls through these ports.
- Cancelled/rejected payment, stock review and Unknown block logistics. Pickup never requires postal tracking. Input survives recoverable command failure.
- Acceptance: every transition is explainable and auditable after reload. Advanced shipping and fiscal panels are clearly Demo/non-homologated; a generated label is not carrier acceptance and a receipt specimen is not a fiscal document.

#### SC-SURF-22 — Inventory

- Demo shows physical, reserved, not-sellable and sellable quantities per variant plus movements, adjustment, reconciliation and Outlet unit/lot traceability.
- Real is read-only through `listInventory`: SKU, `availableQuantity`, `reservedQuantity` and `safetyStock`. Available is already the server read model; the UI does not subtract reservations again or infer physical, damage/not-sellable or Outlet condition from safety stock.
- Demo adjustment requires variant, integer quantity/type and reason, and previews previous/proposed balances. Concurrent conflict preserves the proposal and shows the authoritative balance. Impossible balances are rejected without clamping; a damaged return increases physical and not-sellable atomically.
- States: normal, low, out, adjustment, history, empty filter, concurrent conflict, impossible rejected, reservation block, reconciliation, Outlet availability, loading, error, access denied and Unknown.
- Acceptance: physical includes every variant. Reserved and not-sellable are disjoint subsets. Sellable is the enabled remnant after both exclusions. A variant with active reservations cannot be disabled until reservations are resolved. Archived stock stays visible with sellable zero. Real never exposes an adjustment success/no-op control.

#### SC-SURF-23 — Mercado Libre operations

- Sub-surfaces: account, listings, stock synchronization, activity and competition.
- Account: disconnected, connecting simulation, connected simulation, expired authorization and error.
- Listings: unmapped, mapped, paused, active, warning and error.
- Sync: desired, queued, sent, confirmed, rejected, stale and conflict.
- Competition: none, candidate, low/medium/high confidence, stale, recommendation, human approval, paused and alert.
- Admin and Operator may inspect the five areas. Real can read account/listings and save the existing listing mapping only; no OAuth/connect/disconnect, publication status mutation, sync retry, provider activity feed, price write or competition automation is claimed.
- Real mapping requires the numeric `accountId` accepted by the current contract. Because no account-list selector exists, the field remains explicit advanced input with validation; `accountRef` is not substituted for it.
- Demo retry is one job and idempotent; a superseded/out-of-order event cannot overwrite the latest intent. Candidate approval records a human decision only and never reprices or confirms a provider mutation. Missing cost/floor inputs produce `No evaluable`, not a numeric recommendation.
- Acceptance: simulations are persistent and explicit; desired, queued, sent, observed and confirmed remain distinct. A saved mapping is not an updated publication, and a connected account is not proof of operational sync.

#### Shared operational ledger for SC-SURF-20..23

- The current commercial ledger is authoritative for cross-surface data. SC-SURF-15 is a visual/navigation reference, not a source of counts. SC-SURF-14 `ORD-1007` is an explicit historical snapshot dated 18/02/2025: pickup, simulated approved payment, `DEMO-001/kit-completo` at `$198.800 ARS` plus `LUM-042` at `$84.500 ARS`, total `$283.300 ARS`. Its historical pickup does not enable current pickup.
- Current `DEMO-001/kit-completo` remains `$198.800 ARS`, five sellable units and no pickup configuration; `DEMO-001/bare-tool` is `$124.000 ARS` and exhausted. `LUM-042` has four sellable units. `VLD-043` is Outlet with physical one, not-sellable one and sellable zero. Archived `LMP-044` has physical two and sellable zero.
- The twelve-order Demo fixture, reservations, movements, incidents, returns, listings and sync jobs must reference the same SKU/variant identities and immutable historical prices. Alternative state specimens are isolated and cannot appear as simultaneous current facts.
- Selection/export does not bulk-transition orders. Demo partial return consumes only an eligible unreconciled quantity once; sellable restock, damaged/not-sellable receipt and refund are separate idempotent operations. Demo sync/candidate approval records intent/decision, never provider confirmation.

#### SC-SURF-24 — Capabilities and modules

- Admin and Operator may read and filter modules; only Admin may change a capability in Demo or Real. Unknown/unsupported roles deny the surface. The card separates three closed facts: productive operational state (`DISABLED`, `READ_ONLY`, `ACTIVE`, `PAUSED`, `ERROR`, `Unknown`), availability (`AVAILABLE`, `DEPENDENCY_BLOCKED`, `DEFERRED`, `Unknown`) and delivery level (`DESIGN_APPROVED`, `DEMO_APPROVED`, `INTEGRATION_READY`, `INTEGRATED`, `HOMOLOGATED`, `Unknown`).
- Real currently reads the productive capability catalog only. The versioned mutation UX remains Demo/deferred until the frontend promotes a reasoned command type, port/repository methods and status reconciliation for the existing backend endpoints. Demo requires `configVersion`, a non-empty reason and explicit confirmation; submitting, confirmed, conflict and uncertain results never claim a productive write.
- Acceptance: dependencies/value precede technical configuration; paused shipping blocks checkout before order creation. ARCA, advanced shipping, Outlet, inventory-control and wallet cards expose their honest availability/delivery level and link to their owning surface, but any card without a productive `CapabilityModuleId` is informational only and never receives an invented wire ID or command. Active never means integrated or homologated.

#### SC-SURF-25 — Configuration and import/export

- Admin only. Demo offers typed store settings first (`storeName`, `supportEmail`, `supportPhone`, `currency=ARS`, `timezone=America/Argentina/Buenos_Aires`), plus a scoped export and reset of those fields only. Export excludes credentials, sessions, orders, customers, tokens and provider/legal identity. Reset shows an exact before/after preview and preserves every value outside that scope.
- Real is limited to the existing profile contract: `profile_name=universal-tools-profile`, `profile_version=1.0.0`, `coreCompatibility=1.x`, `content.homeSections` and a non-empty `mergeSelection.homeSections`. Preview renders `ADD`, `UPDATE` and `UNCHANGED`; changing the manifest invalidates the prior preview. Merge requires a compatible current preview, explicit selection and confirmation; it does not delete absent sections or restore unrelated configuration.
- Fixtures are separate: compatible, incompatible, malformed JSON, secret rejected and empty selection. Failure retains input and selection. Demo settings/export/reset never appear as Real controls. Secrets are never exported or merged and unsupported values fail closed.

#### SC-SURF-26 — Customer administration

- Demo only. Admin and Operator may search/read minimum customer data and navigate to correlated orders; only Admin may restrict or reactivate an account. `customer-2209` is the fictitious Rocío Gil fixture (`rocio@demo.invalid`) and owns only `ORD-1015` in the canonical operational ledger.
- Restricting requires a reason and confirmation, changes `ACTIVE -> RESTRICTED`, clears that customer's Demo session, denies new login and blocks new checkout/order creation. It preserves profile, addresses, cart, historical orders, returns and refunds and never cancels or refunds an order. Reactivation changes `RESTRICTED -> ACTIVE`, permits a future login/checkout and does not recreate a cleared session.
- States include populated, empty, no result, active, restricted, unknown, customer-not-found, loading, saving, success, cancellation and read/write failure. Credentials, secrets and session tokens never appear; Unknown denies mutation.

## Cross-surface states

- Access denied offers a safe destination without privileged-content leakage.
- Not found distinguishes absent product/order/route and offers relevant recovery.
- Loading preserves layout and avoids fake final data.
- Empty explains cause and next valid action.
- Unknown uses a fixed safe label, never raw wire text.
- Recoverable error retains valid input and exposes retry.
- Expired/irrecoverable state prevents mutation and explains restart.

## Modal inventory

Product, Address, Campaign, Adjustment, Information, Confirm, Module, Tracking, Receipt, Incident, Return, Zoom and Reset dialogs require content/error, scroll, focus trap, Escape, focus restoration and accessible-name validation.

## Critical defect reproductions

Each item requires expected effect, persistence, reload and repetition evidence:

1. Product original/list price below base price before promotion, including base 100 + 20% offer + original 90.
2. All product variants inactive.
3. Payment cancelled while fulfillment prepares.
4. Payment rejected while fulfillment prepares.
5. IDs whose lexical order differs from creation date.
6. Customer/operator alert audience and target mismatch.
7. Dashboard incident shortcut opening the wrong filter/entity.
8. Missing buyer/contact/date and non-reconcilable physical/sellable inventory.

## User stories

### US-01 — Explore a credible store

As a visitor, I understand the proposition and reach/search products without irrelevant promotional barriers.

### US-02 — Resume purchase after identity

As a customer, I authenticate/register and retain product, variant, quantity and safe destination.

### US-03 — Complete an understandable checkout

As a customer, I select destination, delivery and payment, review the amount and understand every result.

### US-04 — Follow and resolve an order

As a customer, I see chronological progress and submit an eligible partial post-sale request.

### US-05 — Operate orders safely

As an operator, I identify buyer, contact, modality, incident and next valid transition in one flow.

### US-06 — Maintain catalog integrity

As an administrator, I save only products that remain valid after persistence/reload.

### US-07 — Explain inventory

As an operator, I reconcile physical, reserved, unavailable and sellable quantities by variant.

### US-08 — Present future integrations honestly

As a commercial reviewer, I demonstrate provider flows while clearly seeing they are simulations.

### US-09 — Manage customers

As an authorized administrator, I find customers and commercial history without credentials/secrets.

### US-10 — Use common widths

As any user, I complete tasks at 390, 768 and 1440 pixels without hidden controls or overflow.

## End-to-end acceptance scenarios

- E2E-01: catalog filter → PDP → return preserves context.
- E2E-02: selection → login/register → purchase intent restored.
- E2E-03: each delivery modality × payment method × applicable outcome. Home/pickup and card/QR/transfer complete the flow and verify order, amount, reservation/stock, result, reload and next action. Non-applicable combinations are declared in the manifest rather than silently skipped.
- E2E-04: approved payment permits valid fulfillment; cancelled/rejected does not.
- E2E-05: customer/operator share the same timeline after reload.
- E2E-06: partial return preserves remaining eligible quantity and separates refund.
- E2E-07: valid simple product saves; invalid cases remain unsaved.
- E2E-08: inventory adjustment and simulated marketplace sale reconcile by variant.
- E2E-09: alert audience and target navigation remain correct.
- E2E-10: customer → order navigation does not leak privileged data.
- E2E-11: paused module blocks dependent flow before confirmation.
- E2E-12: 404, access denied, empty, error and Unknown recover safely.

## Design approval gate

- Stitch contains 26 surfaces, critical states and responsive behavior.
- UI, UX and Product Owner return APPROVE on the same revision.
- Each surface declares demo, real or both.
- Navigation, collections, checkout/backoffice shells, dialogs and scroll are specified at 390/768/1440.

## Implemented-product acceptance gate

- No reproducible P1/P2 remains.
- Every visible action is executed and its effect asserted.
- At least 78 baseline screenshots exist: 26 surfaces × 390/768/1440.
- Extra evidence covers every critical state, five ML tabs, every inventoried dialog, access denied and 404 at 390, 768 and 1440. Any viewport exception requires a written rationale and UI/UX/Product Owner approval in the manifest; 78 is not a completeness denominator.
- WCAG 2.2 AA applies: text contrast is at least 4.5:1 (3:1 for large text), non-text components and focus indicators are at least 3:1, focus is visible and not obscured, errors are associated with fields, and keyboard-only operation passes. Text resize is verified at 200%; reflow is verified at 320 CSS px (for example 1280 px at 400%) without loss of information/functionality. Bidimensional exceptions are documented per region and stay keyboard accessible. Controls satisfy Target Size Minimum through size, spacing or an applicable documented exception. Automated checks report no applicable A/AA violation.
- Evidence records design revision and application commit.
- UI, UX and Product Owner return APPROVE on executable Angular.

## Requirement precedence and phase ownership

- This iteration supersedes any frontend requirement that mandates two variants: one valid active catalog variant (availability may be zero) and one media item define the minimum simple product.
- The StoreCore Stitch system named in the technical spec supersedes earlier visual tokens for the 26 targets in this feature; unaffected production behavior remains governed by its owning specs.
- Capability states shown in demo must map to the productive capability contract. A demo-only scenario is explicitly labeled and cannot become a productive wire value.
- Mercado Pago/QR demonstrations belong to checkout/result/order detail; advanced shipping belongs to checkout and order detail; ARCA belongs to non-fiscal receipt/status panels; Outlet belongs to catalog, PDP, product administration and inventory; competition belongs to Mercado Libre operations.
- Real ARCA issuance and real competition automation remain deferred under `sdd/PROJECT.md` and their dedicated specs. This feature creates no emission, repricing or provider-mutation task.
- Production scope is exactly the `realScope` declared in `delivery-manifest.json`. Missing route, port, field or endpoint remains demo-only; this feature never invents a backend contract to claim parity.

## Out of scope

- Real credentials, money movement, fiscal issuance, marketplace mutation or carrier booking.
- Provider homologation claims.
- BlackStore/POS screens, multi-tenant runtime or visible store identifiers.
- Fabricated reviews, reputation, sales, installments, coverage or guarantees.

## Success metrics

- 26/26 surfaces in matrix and approved design.
- 100% visible CTAs in action manifest and executed.
- 12/12 E2E scenarios passing for the declared target.
- 0 P1 and 0 P2 in final UI/UX/PO reviews.
- 0 required-width overflow failures.
- 0 applicable automated WCAG 2.2 A/AA violations plus completed manual checks.
