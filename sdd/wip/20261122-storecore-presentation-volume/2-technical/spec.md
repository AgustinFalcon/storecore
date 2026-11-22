# Diseño técnico — volumen de presentación StoreCore

## Architecture

`load-presentation-volume.mjs` is a loopback-only application service. It composes small flow-step objects for preflight, customer seeding, pending checkout, price-policy seeding and readback. HTTP remains at the boundary through `HttpSession`; dataset and state types do not import Angular or Spring.

## Closed types

- `PresentationRunState`: `Create`, `Replay`, `Unknown`.
- `PresentationPricePolicyState`: `Draft`, `Active`, `Paused`, `Unknown`.
- `PresentationDeliveryMode`: `LocalDelivery`, `StorePickup`, `Unknown`.

Each type owns its wire value, label when needed and the only `fromWire` translator. Unknown wire values fail verification rather than leaking raw values to output.

## Deterministic dataset

- Namespace: `storecore-presentation-volume-v1`.
- 24 customers named from an immutable fixture set; emails use `demo.cliente.NN@storecore.invalid`.
- Deterministic UUID checkout keys derived from the namespace and customer ordinal.
- Product assignments rotate across checkout-safe products so reservations do not concentrate stock.
- Every customer receives one default address; alternating customers receive a second address.
- Every customer receives two favorites, one pending order and one post-checkout cart line.
- Twelve distinct SKUs receive manual policies split evenly between draft, active and paused targets.

## Journal and replay

The journal is an atomic JSON file with schema version, namespace, dataset digest and owned records. Before a mutation, intent is persisted. After the API response, the stable identifier and expected fingerprint are persisted. Replay reuses the recorded checkout command/idempotency key and verifies readback. Missing journal plus pre-existing owned rows fails closed instead of guessing ownership.

## Commerce states

Rich payment, fulfillment and return states are created only through the existing official local provider harness and `CommerceScenarioLoader`. The volume loader only creates valid pending orders; it cannot fabricate approval, shipment or RMA rows.

## Validation

- Unit tests cover deterministic fixtures, closed-state translation, loopback and `.invalid` guards, journal validation and drift detection.
- API validation reads every owned customer/order/cart/favorite/address and every owned price policy.
- Aggregate evidence is emitted as a receipt with SHA-256 digest.
- The persistent environment is loaded twice and queried directly for stable counts.
- Browser smoke validates populated buyer and administrator surfaces; the existing full frontend and real-route suites remain regression evidence.
- `CatalogPageComponent` observes `ActivatedRoute.queryParamMap` for the lifetime of the component, projects it into the typed `CatalogQuery`, and triggers one bounded search per route change. Select filters update the route immediately; free text remains explicitly submitted. Logout delegates only to `AccessCoordinator.logout(AccessContext.Customer|User)` and never infers a realm from raw strings.

## Security and operational constraints

No secret is committed or printed. Journal/receipt files live under ignored result directories and are written with restrictive permissions. Only loopback HTTP is accepted. The loader preserves unknown/operator rows and never performs bulk deletion or direct SQL domain writes.
