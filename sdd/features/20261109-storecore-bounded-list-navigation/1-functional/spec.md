# Functional specification

## Requirements

- BLN-R01 — A shopper can traverse every bounded public catalog page without losing the active query, brand, category or offers filter.
- BLN-R02 — An ADMIN/OPERATOR can traverse every bounded admin catalog and WEB inventory page exposed by the existing authorized APIs.
- BLN-R03 — Previous/next controls expose the current page and total page count, are keyboard accessible, and are disabled at their real boundaries.
- BLN-R04 — Changing any public catalog filter starts again at page zero. A manual refresh preserves the selected page.
- BLN-R05 — A late response for an older page/filter/internal actor cannot replace the current view. Closing or changing the USER session clears the protected snapshot before any pending response can publish.
- BLN-R06 — Counts and inventory aggregates say explicitly whether they describe the current page or the server total. Local inventory filters never pretend to search unloaded pages.
- BLN-R07 — Empty, loading, stale/error and unknown metadata paths remain honest. Invalid page metadata does not enable further navigation. If a concurrent total reduction leaves the requested page beyond the new last page, the store retries exactly once at the last valid page (or page zero), preserving filters and never presenting stale rows as the requested page.
- BLN-R08 — Productive Angular continues using HTTP only; Demo and external integrations remain unchanged.

## Acceptance scenarios

1. With 51+ products, page 1 is reachable from the storefront and admin catalog and page 0 remains reachable again.
2. With 51+ inventory variants, the operator reaches the second page and sees page-scoped metrics and filters.
3. A public filter change from a later page requests page 0 with the new criteria.
4. Rapid page changes cannot render an older response after the newer response.
5. Page zero has no previous action; the last page has no next action; zero totals render one stable empty-page state.
6. A dataset shrinking from 51 to 50 rows while page one is selected recovers once to page zero without a request loop.
7. Logout or internal actor replacement while an admin catalog request is pending clears the snapshot and ignores the delayed response.

