# PCC-012D — Angular report dashboard and navigation evidence

Date: 2026-11-26

## Scope closed

- Added the operator-only `/user/reports` route behind the existing `userGuard`.
- Added a standalone dashboard component backed by `ReportDashboardStore`; it binds the validated URL period, supports refresh/apply, and renders closed availability labels rather than raw wire strings.
- Available StoreCore order data renders count and ARS total. BlackStore sales, net revenue and current stock preserve their explicit `No modelado`/unavailable states; no zero or invented history is shown.
- Added `SurfaceIdentity.Reports` and HTTP/real route bindings so the productive route census remains exact and evidence-bearing.

## UB-mode cycle

The first focal behavior run failed because the dashboard component was absent. The smallest implementation added the component, then the acceptance text required by the existing contract was added without changing domain semantics. A route-census failure after wiring the route exposed the missing manifest identity; the closed surface identity, HTTP binding and real binding were added, and the expected census was updated from 36 to 37 leaves.

## Reproducible local evidence

- `npm.cmd test -- --include=src/app/features/reporting/report-dashboard.store.spec.ts --include=src/app/features/reporting/report-dashboard.component.spec.ts` — 2 files, 4 tests, all passed.
- `npm.cmd test -- --include=src/app/app.route-coverage.spec.ts --include=src/app/features/reporting/report-dashboard.store.spec.ts --include=src/app/features/reporting/report-dashboard.component.spec.ts` — 3 files, 11 tests, all passed.
- `npm.cmd run check:architecture` — 9 tests passed and the container/view/store/use-case/HTTP repository scan passed.
- `npx.cmd eslint src/app/features/reporting src/app/app.routes.ts` — passed after removing unused imports.
- `npm.cmd run build` — passed. Existing initial-bundle warning remains at 739.60 kB versus the 700 kB warning budget.
- `git diff --check` — passed.

## Remaining boundary

PCC-012D closes the dashboard/navigation slice. Safe CSV download and integrated accessible browser journeys remain PCC-012E; hosted CI, review and merge remain PCC-013. No production external provider, credential or homologation is claimed.
