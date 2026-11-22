# Expansión del catálogo de ferretería para presentación

Status: approved for the local client demonstration.

## Objective

Expand the persistent StoreCore hardware catalog from 80 to 152 products so catalog, search, category and inventory surfaces visibly demonstrate a broad professional hardware-store assortment.

## Requirements

- FCE-R01: Preserve the existing 80 products and every operator-owned field.
- FCE-R02: Add exactly 72 deterministic synthetic products, six in each of twelve hardware-store categories.
- FCE-R03: Every added product has exactly four ordered locally served catalog photos, a plausible ARS price, positive varied stock, invented copy and an invented or generic presentation brand.
- FCE-R04: Create products only through the authenticated StoreCore catalog API; direct SQL domain writes are forbidden.
- FCE-R05: The load is replayable: owned SKUs are verified on the second run and no product, variant, image or stock row is duplicated.
- FCE-R06: Owned records may be deterministically reconciled to the approved fixture; unknown decisions fail closed. Finite loader decisions use a closed type with `Create`, `Reconcile`, `Preserve` and explicit `Unknown` cases.
- FCE-R07: Validate aggregate database counts and public catalog/browser visibility while the demo remains available.

## Acceptance

1. Database totals are 152 products, 152 variants and 452 ordered images.
2. Each expansion SKU has four media rows and an inventory balance.
3. Replaying the loader reports 72 preserved products and zero new creations.
4. Public catalog, search and administrator catalog/inventory continue rendering successfully.
5. Every rendered product-gallery image completes with a non-zero natural width without relying on runtime Internet access.

## Non-goals

No real merchant data, external provider activation, scraping, production deployment or image ownership claim is introduced.
