# StoreCore frontend residual-gap closure — 2026-11-06

Base: `e5d94a02ea3d9fc7328743c700a1ee5a0c42b08d` (`master` after PR #225).

Status: implementation and complete local verification approved; exact-head Sol
reviews, remote CI, PR and merge remain separate until recorded below.

## Why this cut exists

The strict post-merge audit did not reopen the whole frontend. It found two
bounded acceptance gaps in the approved 20261014 specification:

1. SC16 promised Demo banner/category authoring, but the promoted editor only
   supported title, subtitle and text blocks.
2. The buyer flow offered Pickup for every cart, while the canonical ledger says
   current `DEMO-001` has no pickup configuration and historical pickup does not
   enable a current purchase.

An initially suspected checkout price-clock mismatch was reproduced and rejected:
catalog, cart and checkout use the same stored offer reference.

## Implemented scope

### SC16 Demo merchandising

- Added closed banner theme and destination types with one wire translator and
  `Unknown` fail-closed behavior.
- Added closed merchandising item kind plus object steps for add, remove, move
  and category selection; the view no longer compares finite string literals.
- Added up to three local banners with create/edit/remove/order controls.
- Added category selection and ordering derived from active catalog categories.
- The seeded Demo opens populated with one curated banner and all current active
  categories, including Outlet. An explicit empty category selection remains a
  valid intentional state.
- Draft clone, validation, persistence, preview, discard and legacy snapshot
  compatibility remain isolated from the published Home and from Real.
- No arbitrary URL, CSS class, provider call or Real banner/category contract was
  introduced.

### Pickup eligibility

- Added closed `PickupAvailability` plus the sole `PickupDestination.fromWire`
  boundary for optional catalog-presentation pickup configuration.
- Pickup is eligible only when every active cart presentation names the same
  non-empty configured destination.
- Missing, malformed, mixed, disabled or unknown presentations fail closed.
- UI exposes only eligible modalities and retains an invalidated selection with
  recovery guidance; the domain repeats the check before any order, stock or cart
  mutation.
- `DEMO-001` remains ineligible. `DEMO-002/standard` is the explicit fictitious
  pickup specimen. Existing historical pickup orders are unchanged.

## Local evidence

- Baseline before the cut: architecture 7/7, lint, 132 test files / 975 tests and
  optimized Real build passed.
- Directed unit/component after corrections: 6 files / 38 tests passed. The
  final closed-kind refactor was repeated independently as 2 files / 11 tests.
- Directed browser integration: SC16, route/CTA inventory and full CTA matrix,
  51/51 passed. This includes Axe at 320/390/768/900/1440, no overflow, the
  configured/mixed pickup flow, reload, persistence and zero unexecuted CTAs.
- First full Demo run: 323/331 passed and exposed eight integration failures
  (untracked controls, stale category count, inherited paragraph contrast and
  CTA coverage). All eight were corrected before the directed 51/51 rerun; the
  failed run is not represented as a green gate.
- Final exact-source `npm run verify`: architecture 7/7, lint, 134 files / 988
  tests and optimized Real build passed.
- Final exact-source `npm run test:demo`: 334/334 browser scenarios passed in
  30.8 minutes with one worker.
- Coordinated Astra Product and UX/UI reviews both returned `APPROVE` with no
  P1/P2. Product also independently repeated 4 files / 28 tests and confirmed
  the final closed-kind delta with 2 files / 11 tests. UI additionally exercised
  keyboard removal from 3→0 banners and 4→0 categories and checked 320/390px.

## Explicit boundaries

- Demo payment, shipping, pickup and publication remain simulations.
- No Mercado Pago, MODO, carrier, ARCA or Mercado Libre provider effect is added.
- Real SC16 remains limited to the already supported title/body publication.
- Provider homologation, deployment and the StoreCore↔BlackStore operational
  release remain outside this frontend cut.

## Final gates

To be completed only with exact evidence:

- Full `npm run verify`: PASS — architecture 7/7, lint, 988/988, build.
- Full `npm run test:demo`: PASS — 334/334.
- Astra UI/UX/Product review: APPROVE — no P1/P2.
- Two independent GPT-6.1 Sol exact-head reviews required by repository policy:
  pending.
- Remote CI / PR / merge: pending.
