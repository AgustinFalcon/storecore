# PCC-004 — responsive notification center evidence

Date: 2026-11-24

## Delivered boundary

- Lazy USER routes for the notification inbox and detail, available to ADMIN and OPERATOR and registered as productive surfaces SC-SURF-28/29.
- Closed TypeScript domain vocabularies and a single wire mapper for severity, category, source, lifecycle, operations, outcomes, preference state, readiness, revisions, UUIDs and decimal backend actor identities.
- URL-owned filters and notification-specific pagination through page `2,147,483,647` and size 100; invalid or repeated filters fail closed without broadening the query.
- ADMIN-only lifecycle commands with exact idempotency keys, persisted actor/epoch recovery intent, strict receipt correlation and current-detail refresh.
- ADMIN/OPERATOR self-service email preference with explicit category/severity consent and production readiness shown independently as `UNCONFIGURED`.
- CSRF rotation for successful and recorded-409 notification mutations without widening the interceptor to unrelated endpoints.
- Deterministic synthetic wires for populated, empty, future/unknown and unconfigured states, all translated through the production mapper.
- Responsive, keyboard-addressable inbox/detail views with neutral unknown rendering, textual severity/state and no inferred subject, read state or producer link.

Production email transport remains `UNCONFIGURED`; this slice adds no SMTP, scheduler, credentials or external network activation.

## Validation

- `npm run verify`: architecture, project-service smoke, ESLint, 236 test files / 1,665 tests and production build all PASS.
- Notification focal Angular matrix: 7 files / 46 tests PASS, including invalidation and store rejection when a reviewed lifecycle revision changes before confirmation.
- `e2e/admin-notifications.spec.ts`: 6/6 PASS at 320, 390, 768 and 1440 px, including Axe serious/critical = 0, ADMIN exact command contract, OPERATOR read-only behavior and invalid-query fail-closed behavior.
- `npm run test:a11y`: complete Playwright matrix 189/189 PASS, including both new productive routes on mobile and desktop.
- Real backend contract alignment: receipt `actorId` is a positive decimal `Long`, while alert and command identities remain UUIDs; tests reject UUID-shaped actors.
- Productive surface manifest: 29/29 identities and backend contracts PASS.
- `git diff --check`: PASS.
- Non-blocking build warning retained honestly: initial bundle is 707.73 kB against a 700 kB warning budget; compilation succeeds and both notification screens remain lazy chunks.

PCC-005 owns the two independent exact-SHA reviews, GitHub CI and merge evidence. It is not complete in this document.
