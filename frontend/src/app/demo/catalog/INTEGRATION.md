# Integration contract for #191

This slice supplies catalog/cart domain objects and tests. Application composition,
snapshot migration, routes, views and asset integration remain in #191.

- Compose/reexport catalog-model.ts, checkout-model.ts and DemoReservationState;
  do not redeclare closed states, because their singleton identity is significant.
- Supply DemoCatalogQuery's quote callback from #188. Without a variant ID, the
  query selects the active variant with the smallest base price, consistent with
  refreshTotals; a concrete variant always keeps its own quote.
- Implement requireCatalogAccess and the cart's access ports using the current
  authenticated session. requirePaymentAccess(actorId, order) must verify both
  a valid active session and ownership or an explicit administrative permission.
  Payment resolution/cancellation require actorId and call that gate before any
  reservation or payment mutation, including an idempotent cancellation.
- Checkout requires an explicit Home or Pickup delivery method. Home requires
  the Shipping capability and includes its delivery cost; Pickup requires a
  shared configured location. Do not omit delivery when adapting older callers.
- Keep variant IDs explicit. Empty/blank IDs are invalid; only undefined in a
  catalog query requests an aggregate. Legacy aliases must translate at the edge.
- Payment notification callbacks update the application's in-memory alert state;
  incident state and global persistence remain composition responsibilities.

## Image dependency

DemoProductDraftEditor defaults to /assets/demo/DEMO-001.jpg through DEMO-012.jpg
and its initial draft references DEMO-010.jpg. These JPEGs are absent from this
base, which supplies SVG demo assets. #191 must bring the snapshot's matching
JPEG assets (and validate their loading) or inject a mediaOptions list of existing
local assets and replace the initial draft media consistently. No JPEGs or visual
acceptance evidence are included in this domain-only slice. The Outlet fixture
uses the existing DEMO-004.svg.
