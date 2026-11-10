# StoreCore productive surface data parity

Feature: `20261108-storecore-productive-surface-data-parity`
Status: `completed`
Branch: `codex/storecore-production-data-coverage`
Owner: StoreCore core maintainers.

## Objective

Replace the remaining presentation-only StoreCore data paths with explicit,
authenticated HTTP contracts and credible local showcase data. The productive
Angular graph remains separate from the Demo build and never falls back to a
fixture when an API read fails.

## Boundaries

- Single merchant installation; no `store_id` or shared runtime.
- Phase 1 local commerce only. Mercado Pago, Mercado Libre live, ARCA, Correo
  Argentino, competitor intelligence and StoreCore/BlackStore live activation
  remain separate homologation tracks.
- Existing demo screens remain a sales artifact until their productive
  vertical is implemented and independently accepted.
- Every finite state is a closed domain type with one wire translator and an
  `Unknown` case. Views do not compare wire strings.


## Documentary close-out — 2026-11-10

PR #231 final head `9108798818b0217dcf5bb4685f59a195d63637ae` passed Verify `42538029894` (backend, frontend and unified-access-real-e2e) and merged as `eca9db9f0ba51023c8b785831003cb04d8ba0660`.

Independent retrospective GPT-6.1 Sol medium code/product and security reviews on 2026-11-10 inspected the exact diff from `e8d2dcd` to `9108798` and returned `APPROVE` with no P0-P3 findings for the implemented local scope. They do not claim live Mercado Libre, payments, ARCA, carriers, BlackStore activation, deployment or homologation.
