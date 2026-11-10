# Plan — productive variant editor

1. Record the exact master baseline and local/external boundaries.
2. Extend `VariantStatus` with selectable cases and the Unknown persistence rule.
3. Add immutable editor commands for existing variant name, status and attributes.
4. Render accessible controls while preserving identity, SKU and inventory facts.
5. Reject incomplete or Unknown variant commands before the HTTP use case.
6. Add focused domain, component and store tests.
7. Run complete frontend gates and two independent exact-head reviews.
8. Open a small PR, pass exact-head CI, archive the SDD honestly, merge and verify master.
