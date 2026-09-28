VERDICT: APPROVED

Architecture: ok
State Management: ok
Error Handling: ok
Effects: ok
Naming: ok

# Grok review — frontend architecture — storefront mock (re-review)

**Fecha:** 2026-09-28
**Branch:** `integration/storefront-mock` (committed tip plus uncommitted frontend)
**Scope:** Re-read of the cart, checkout, shipping, billing/receipt, orders, and admin notice paths after the important findings in this file. No product edits. No commit. No merge.

Checked against StoreCore: Container → view → ComponentStore → use case → `IRepository` → HTTP. The generic NgRx checklist is not this baseline.

## Validations

- Re-read `cart.store.ts`, `checkout-shipping.store.ts`, `customer-order-detail.store.ts`, the order-detail and checkout-result containers and views, `order.entity.ts`, `http-mappers.ts`, `user.store.ts`, and `customer.store.ts`.
- `npm run check:architecture` in `frontend/`: **passed.**
- Caller recorded `npm test`: 42 files, 126 tests, passed. This re-review did not re-run that suite.
- View files still do not import `ComponentStore`, `HttpClient`, or `UseCase`. `CustomerOrder.paymentMethod` is `PaymentMethodId | null` via `import type` from the cart entity. The order entity does not import Angular.

## Closed

- `cart.store.ts:103` — `loadShipping` failure sets `errorMessage`, clears `notice`, and sets `shippingOptionId` to null. `add` (`:139`), `load` (`:90`), and `loadAddresses` (`:120`) clear `notice` on error. `load` does not clear a success notice at the start of the reload.
- `checkout-shipping.store.ts:83` and `:97` — `choose` and `mark` only clear `errorMessage` before the use case. `selectedId` and the pin change in `placed()` after a successful save (`:89`, `:103`). A rejected save leaves the last stored selection and sets `errorMessage` (`:90`, `:104`).
- `customer-order-detail.store.ts:40` — a shipping failure keeps the order and sets `shippingError`. Order detail (`customer-order-detail.view.html:62`) and checkout result (`checkout-result.view.html:25`) render that alert and do not show the simulated quote in the same branch.
- `order.entity.ts:9` — `paymentMethod` is `PaymentMethodId | null`. `http-mappers.ts:25` maps only `MERCADO_PAGO` and `CASH`; any other value is `null` (`:247`).
- `user.store.ts:175` and `:237` — `loadHome` and `loadPromos` clear `notice` on error. Their start taps do not. `persistPromo` (`:259`) sets the success notice and then calls `loadPromos`. `customer.store.ts:193` clears `addressNotice` on `loadAddresses` error. `persistAddress` (`:218`) and `removeAddress` (`:236`) set the success notice and then reload without clearing it at the start of that load.

## Critical

None.

## Important

None.

## Suggestions

- `cart.store.ts:175` — `submitCheckout` sets `errorMessage` and does not clear `notice`. Checkout does not render `notice`. Cart and product do, and `CartStore` is app-wide, so a pay error can sit beside an older “Agregaste el producto” banner after navigation. Same for the validation patch at `:150`. Not the failing screen’s own banner pair.
- `loadShipping` (`cart.store.ts:97`) still has no `loading` flag. A failure is no longer silent. A slow success can appear after the cart load finishes.
- The shipping alert on order detail and checkout result has no retry button. Retry stays on the order-level `sc-feature-status`, which is hidden when the order itself loaded. Re-entering the route calls `load` again.
- Dialog open flags stay in the views. `checkout-shipping.view.ts` and `shipping-track.view.ts` still import the state type from the store file, as `cart-page.view.ts` does. `location-map.component.ts` still calls `navigator.geolocation` and emits the pin. None of these break the split.
