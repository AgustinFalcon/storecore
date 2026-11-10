# Implementation progress

- 2026-11-09 — Three independent GPT-6.1 Sol read-only audits on StoreCore
  `64116491a5356fe15b091fe9553e30f0840fba24` identified the local checkout,
  wire-contract, role-policy and presentation gaps captured by this WIP.
- Paginación is explicitly excluded: PR #234 already closed public/admin/inventory
  bounded navigation and master Verify `42678381720` is green.
- External providers, deploy and homologation remain NO-GO.
- 2026-11-09 — Specification freeze `1b8236eaaba8806185d32754f9d286cbcd18d407`
  (base `64116491a5356fe15b091fe9553e30f0840fba24`) received two independent
  OpenAI GPT-6.1 Sol medium APPROVE reviews with no P0–P3. LCBH-T01 is done and
  implementation GO is limited to LCBH-T02–T06.
- 2026-11-09 — LCBH-T02/T03 implemented: checkout locks products ascending,
  variants ascending and balances ascending before any new claim; catalog writers use
  the compatible order; retired lines reject without effects and remain removable;
  completed replay and price snapshots remain stable. Local offer discounts delegate
  to the closed `DiscountKind` and reject Unknown.
- 2026-11-09 — LCBH-T04/T05 implemented: cart/receipt structures fail closed,
  malformed checkout keeps key/route, future status strings alone become Unknown,
  navigation matches backend roles, overview rows deep-link and filtered offers have
  an announced clearable empty state.
- 2026-11-09 — LCBH-T06 reconciles surface operations and canonical records without
  claiming PSD/Showcase archive. Local gates on the integrated dirty snapshot: backend
  Maven **274/274 PASS** (PostgreSQL 16/Testcontainers, 05:25); frontend architecture
  9/9, lint, **1120/1120**, production build PASS; browser/axe **60/60 PASS**; manifest
  validator **2/2 PASS**. Build retains the pre-existing non-failing initial-bundle
  warning (771.69 kB against 700 kB warning budget).
- T07 remains pending: exact-head implementation reviews, hosted Verify, archive and
  merge have not occurred.
- 2026-11-09 — First exact-head cross-review on `4da2b97043e556eb78a6182d403feb32a48c8e04`
  found one P2 and two P3 issues. The checkout retry now replays the preserved attempt
  instead of reloading a durably emptied cart; `PRODUCT_NOT_SELLABLE` is translated by
  the closed `ApiErrorCode` into corrective Spanish guidance; SC19 now records the
  reachable campaign-state transition. The failure path is represented by the closed
  `CartFailureKind`, never by view-owned magic strings. Corrected local gates: focal
  frontend **17/17 PASS**; architecture 9/9, lint, **1123/1123**, production build
  PASS; browser/axe **60/60 PASS**. The non-failing bundle warning is 773.28 kB against
  the 700 kB warning budget. A new exact-head candidate, hosted Verify and two fresh
  independent reviews are still required.
