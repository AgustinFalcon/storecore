# StoreCore local commerce boundary hardening

Completed the remaining local phase-1 commerce boundaries without activating an
external provider, deployment or homologation.

## Delivered

- Atomic checkout sellability with product → variant → balance locking.
- Safe removal of retired cart lines and durable completed replay.
- Closed `DiscountKind`, `ApiErrorCode` and `CartFailureKind` decisions.
- Strict cart/receipt wire translation with preserved checkout attempts.
- Role-aligned operational navigation, overview deep links and clearable offer states.
- One corrective checkout action per failure kind.
- Route navigation that avoids duplicate CSRF rotation while fresh boots still
  revalidate both realms.
- Reconciled productive surface operations and canonical phase-1 records.

## Evidence

- Backend: 275 tests passed with PostgreSQL 16/Testcontainers.
- Frontend: architecture 9/9, lint, 1,127 tests and production build passed.
- Browser/accessibility: 60/60 Playwright journeys passed.
- GitHub Verify `42738829321`: backend, frontend and unified-access-real-e2e passed.
- Two independent GPT-6.1 Sol final reviews approved the exact candidate with no
  P0–P3 findings.

## Boundaries

Mercado Pago, Mercado Libre, ARCA, carrier, email, BlackStore live activation,
deployment and homologation remain outside this feature and are not claimed.
