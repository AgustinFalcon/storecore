# Diseño técnico — expansión de catálogo

`localize-catalog-photos.mjs` downloads the allowlisted showcase photo pool once into `src/assets/showcase/catalog` and writes a source-to-local manifest. Angular copies that directory to `/assets/showcase`; the presentation then has no runtime dependency on Unsplash. `load-catalog-expansion.mjs` derives an immutable fixture set from a closed twelve-category matrix and assigns category-specific local photos where at least four are available. Products use the `SHOW-PLUS-NNN` namespace.

The loader accepts loopback HTTP only, authenticates as the synthetic presentation administrator and performs GET-before-PUT. `CatalogExpansionDecision` owns `CREATE`, `RECONCILE`, `PRESERVE` and `UNKNOWN`; verification never branches on raw decision strings. Existing variants omit inventory fields during reconciliation so stock remains owned by the inventory adjustment flow.

Creation and reconciliation readback verify SKU, name, category, brand, ACTIVE state, one active variant, inventory formula, price and four ordered primary/media records. Replay verifies the same owned fingerprint and emits a content-only SHA-256 digest stable across operational outcomes.

`CatalogImageReference` is a sealed Kotlin wire type that accepts only secure HTTPS references or constrained application-owned `/assets/...` paths and maps every other value to `Unknown`. Database migrations V31/V32 align the persistence constraint with the same closed policy.

The loader never updates or deletes the original 80 products. It may reconcile only the owned `SHOW-PLUS-NNN` namespace; no direct SQL domain writes are used. Playwright validates the public total, tile density, product gallery, image natural dimensions and the complete 24-route admin/customer presentation suite.
