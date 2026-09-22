# TASK-005 — Production storefront catalog and content

**State:** complete. Satisfied by HTTP catalog, not the fixture prototype.

## Evidence

- Public `GET /api/v1/catalog`, `/catalog/products/{sku}`, `/catalog/brands`, `/catalog/categories`, `/content/home` after `STOREFRONT/SERVE`.
- Admin `GET/PUT /api/v1/user/catalog*`, `/user/content/home` after `CATALOG/READ|MANAGE`, internal cookie + CSRF, audited home writes.
- `CommerceHttpIntegrationTest.catalog search and admin home draft` exercises search, product write, and `{title,body}` home draft.
- GATE: that HTTP integration plus frontend `CatalogHttpRepository` bound in production. `mvn test` exit 0 on 2026-09-22.

## Out of this evidence

- Stitch visual QA / accessibility browser pass (TASK-013 notes residual UX review).
