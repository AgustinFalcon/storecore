# FE-COMP-03 integration boundary

This slice owns the framework-free post-sale and partial-refund contract. It is
based on the immutable order lines introduced by FE-COMP-02 and deliberately
does not edit the current Demo screen or persistence coordinator. Those are
composed in the later buyer/operator runtime slices.

## Composition

- Build `DemoPostSaleSnapshot` from the canonical Demo snapshot. `orders` keep
  the paid `variantId`, quantity and integer-cent unit price; `returns` and
  `postSaleAlerts` are durable arrays.
- Construct `DemoPostSaleCommands` with the FE-COMP-02 `DemoCatalogQuery` and
  explicit customer/admin authorization ports.
- Persist closed values only through `DemoPostSaleWire.request`; validate the
  full order aggregate with `DemoPostSaleWire.validateOrder` before exposing a
  restored snapshot.
- Treat an order line as the composite `sku + variantId` in selection,
  availability, deduplication, disposition and wire validation. A variant ID is
  not assumed globally unique.
- Render `DemoReturnStatus`, `DemoReturnReason`,
  `DemoReturnInspectionResult`, `DemoReturnDisposition`,
  `DemoReturnAccounting` and `DemoRefundStatus` directly. A view must not
  compare their wire strings.

## Required flow

`Requested -> Approved -> Received -> Inspected -> Disposed -> Refunded`.
Rejection and buyer cancellation close a request before reception. Each step is
an independent object and repeated identical commands are no-ops. Disposition
is the only inventory effect: sellable units increase availability, while
damaged units increase physical and non-sellable quantities together. Refund is
separate, excludes delivery cost and never changes the original order total.
`NeedsReview` remains in `Received` and requires a later `Complete` inspection;
`Unknown` never authorizes a write. Persisted status, inspection, disposition
and accounting combinations are validated as one matrix before composition.

Provider refunds, bank settlement, ARCA documents, shipment transitions,
general inventory screens, alerts UI and HTTP endpoints are outside this slice.
The `SIM-REFUND-*` receipt is local evidence only.
