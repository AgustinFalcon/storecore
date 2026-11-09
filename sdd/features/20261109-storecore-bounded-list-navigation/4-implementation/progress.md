# Progress

## 2026-11-09

- Gap discovered by independent StoreCore master audit after PR #233.
- Existing backend `page/size` and stable LIMIT/OFFSET verified; no backend or DDL expansion needed.
- SDD functional, technical and task layers created before implementation.
- Implemented a closed `BoundedPageRequest` domain input and shared accessible pagination presenter.
- Connected public catalog, actor-bound admin catalog and actor-bound inventory to the existing HTTP `page/size` contract.
- Filter changes reset to page zero; stale generations are discarded; totals that shrink trigger one bounded recovery and fail honestly if the contract remains inconsistent.
- Corrected the shared bounded-list translator so `truncated` is derived from the absolute page offset, not only the number of entries on page zero.
- Review found the matching legacy defect in backend catalog/order projections; corrected both read models and their domain/HTTP integration contracts instead of weakening the frontend boundary.
- Preserved keyboard focus across page loads with mounted, event-guarded `aria-disabled` controls; added next→previous focus and reflow coverage at 390/768/1440.
- Added an honest pending-filter state so editing storefront filters no longer announces a false empty result before Buscar.
- Final frontend gate passed after review fixes: architecture 9/9, lint, 163 test files and 1114 tests, production build.
- Final backend gate passed: Maven 268/268 tests with PostgreSQL/Testcontainers, including the corrected catalog and order HTTP projection contracts.
- Final browser/accessibility gate passed: 60/60 Playwright journeys, including keyboard next→previous, focus retention and reflow at 390/768/1440 for buyer/admin/inventory.
- Product/UX, technical and security re-reviews approved with no P0–P3.
- Exact-head GitHub Verify run `42675235368` passed all three jobs: backend, frontend and unified real E2E.
- BLN-T01..T05 completed; the SDD is ready for atomic archival before the documentation-only close-out commit and final exact-head gate.

## Learnings per task

- BLN-T01/BLN-T04: bounded metadata must use the absolute offset (`page * size + returned items`) on both sides of the wire; page-zero-only semantics silently break later pages.
- BLN-T02/BLN-T03: keep pagination controls mounted while loading and guard activation with typed navigation state so keyboard focus survives asynchronous page changes.
- BLN-T02: edited-but-unapplied filters are a distinct presentation state; they must not masquerade as an empty server result.
- BLN-T03: protected stores bind response publication to an actor generation and clear snapshots immediately on actor replacement or logout.

