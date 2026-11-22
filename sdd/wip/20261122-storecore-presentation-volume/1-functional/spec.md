# Volumen de presentación StoreCore

Status: approved by the product owner for the client presentation environment. External-provider production activation remains excluded.

## Objective

Turn the existing hardware-store showcase into a dense, credible StoreCore demonstration. Buyer and administrator surfaces must contain enough synthetic data to explain the core business without pretending that external homologations are complete.

## Requirements

- SPV-R01: Preserve the existing 80-product hardware catalog, galleries, offers and home content. The volume load never deletes or rewrites operator-owned rows.
- SPV-R02: Create 24 deterministic `.invalid` customer accounts with invented names, one or two addresses, favorites and a non-empty cart.
- SPV-R03: Create one pending checkout per volume customer through the customer cart, delivery quote and checkout APIs. No order, payment or shipment state may be inserted directly in the database.
- SPV-R04: Add the nine official-local-provider commerce scenarios covering pending payment, approved payment, preparation, shipment, delivery, pickup and return/disposition states.
- SPV-R05: Add twelve manual price policies on distinct products with a useful mix of draft, active and paused states, using the administration API and closed transition types.
- SPV-R06: Every finite state used by the loader is a closed type with one `fromWire` translator and an explicit `Unknown` case. UI and verification logic do not compare state strings directly.
- SPV-R07: The load is deterministic, journaled and replayable. A second execution creates no duplicate customer, order, favorite, address, cart line or commercial policy.
- SPV-R08: The loader fails closed on journal drift, unexpected server state, non-loopback targets, non-`.invalid` demo identities or missing capabilities.
- SPV-R09: Validate aggregate counts and representative buyer/administrator readbacks after injection, then exercise browser smoke journeys over the populated environment.
- SPV-R10: Mercado Libre, production Mercado Pago, ARCA, Correo Argentino and live email remain visibly unconfigured or disabled. Local provider evidence is labelled as local demonstration evidence.
- SPV-R11: Catalog query parameters remain reactive while Angular reuses `/catalog`; category, brand and offer controls apply visibly, filters can be cleared, and an authenticated realm exposes an explicit realm-scoped `Cerrar sesión` action.

## Acceptance

1. The persistent demo exposes at least 26 customer identities, at least 34 orders in total after the commerce scenarios, at least 24 populated carts, at least 48 favorites and at least 27 addresses.
2. Administrator order surfaces contain the complete nine-scenario status graph, including one returned order with confirmed mixed disposition.
3. Replaying the volume and commerce loaders produces identical owned identifiers and stable aggregate counts.
4. A customer can sign in, browse products, see favorites, edit a populated cart, inspect addresses and read its pending order.
5. An administrator can inspect dashboard, products, customers, orders, offers, content and price policies with presentation-sized data.
6. Automated tests prove schema/state translation, deterministic identities, replay decisions, fail-closed validation and populated browser/API readback.
7. Navigating between catalog category links updates the selected filter and result count without a hard reload; combined filters and clearing produce coherent URLs and results, and CUSTOMER/USER logout never revokes the other realm.

## Non-goals

This slice does not activate or claim homologation with any external provider, send real notifications, create real people, replace client data, scrape competitors or make production deployment claims.
