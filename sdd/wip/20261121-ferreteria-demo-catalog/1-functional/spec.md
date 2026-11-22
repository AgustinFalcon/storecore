# Catálogo demo de ferretería

Status: implementation approved by the product owner for the local showcase; no production deployment or external-provider activation.

## Objective

Provide a dense, credible StoreCore presentation dataset for a hardware and professional-tools shop. The dataset must exercise the real StoreCore APIs and database, not only an Angular mock, while remaining synthetic and safe to share.

## Requirements

- FDC-R01: Supply one committed synthetic catalog with exactly 40 active products across exactly eight useful retail categories: power tools, hand tools, cutting and abrasives, fasteners, measurement, safety, painting and construction/garden.
- FDC-R02: Every product has an ordered gallery of two to four HTTPS images. The first image is the card/hero image and the remaining images exercise the product-detail gallery.
- FDC-R03: Keep `SHOW-TALADRO-18V`, `SHOW-AMOLADORA-850` and `SHOW-SET-MANUAL` as the loader journey identities, independently of product order. Their stock and price remain checkout-safe.
- FDC-R04: Prices and stocks are varied and plausible presentation data in ARS. At least eight products are low-stock (one to three units), while the cart journey remains executable.
- FDC-R05: Product copy, brands and SKUs are invented presentation data; no credential, customer secret, external account, real merchant claim or provider activation is introduced.
- FDC-R06: Import validates the complete file before HTTP, creates only missing records through existing StoreCore APIs, preserves operator edits on replay and verifies ordered galleries for newly created products.
- FDC-R07: The previous one-image V1 dataset remains accepted. The new gallery format is V2. Unknown versions and unknown fields fail closed.
- FDC-R08: Automated evidence covers translation, bounds, backward compatibility, real loader replay, catalog readback, buyer flows and administrator flows. A failed flow remains a failed gate.

## Acceptance

1. `ferreteria-demo.json` translates to 40 immutable products, eight categories and galleries within the declared bounds.
2. V1 still translates to the same internal gallery representation and emits the same catalog command.
3. Loading V2 twice into one disposable PostgreSQL/Spring environment produces no duplicate products or destructive reconciliation.
4. Real API readback exposes the expected products, stock, price and ordered images for newly created rows.
5. Browser/API journeys cover login, catalog/search/category, product detail/gallery, favorites, cart/quantity, checkout pending order, profile/address, order history, admin overview, catalog/product detail, customer detail, offers and home content.

## Non-goals

This slice does not claim live Mercado Pago, Mercado Libre, ARCA, Correo Argentino, SMTP, deployment or StoreCore/BlackStore activation. It does not reconcile pre-existing operator rows and does not replace real client data.
