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
- 2026-11-09 — Two fresh independent GPT-6.1 Sol medium reviews of `db4f74c926e14d5802e819587e4929347221206f`
  both requested changes for the same two P2 gaps: multi-unit retired lines lacked an
  explicit remove-all UI command, and manual promotion creation still used a joined
  variant/product lock. The cart now exposes an accessible quantity-zero removal and
  `JdbcPromoService` follows product → variant explicitly; PostgreSQL coverage proves
  a promotion waiting on its product has not already locked the variant. A corrected
  head must repeat both independent reviews. Corrected local gates are green: backend
  Maven **275/275 PASS** (PostgreSQL 16/Testcontainers, 03:55); focused commerce
  integration **19/19 PASS**; frontend architecture 9/9, lint, **1124/1124**, production
  build PASS; focused cart/checkout **17/17 PASS**; browser/axe **60/60 PASS**. The
  non-failing bundle warning is 773.48 kB against the 700 kB warning budget.
- 2026-11-09 — Both independent exact-head reviews approved
  `e4560a99c907d8eb20c985ccf724f793aa20f955` with no P0–P3, but hosted Verify
  `42735473447` exposed a real navigation/logout race: a route guard started a
  second CSRF rotation after login, and an immediate logout could send the first
  token after the second response was aborted by navigation. `navigationState()`
  now reuses a closed, already accepted `AccessState` for same-runtime route guards;
  a fresh browser boot remains `Indeterminate` and performs authoritative probes.
  The regression proves navigation emits no second realm/CSRF probe and logout uses
  the accepted realm token. Frontend architecture 9/9, lint, **1125/1125**, and
  production build pass locally; the pre-existing non-failing bundle warning is
  773.58 kB against the 700 kB warning budget. The real E2E cannot run locally
  because `psql` is absent, so the corrected exact head must prove it in hosted CI
  and repeat both independent reviews before T07 can close.
- 2026-11-09 — The final coordinated review of `8d2d1a5c081f5879d11e9cc8279c6237d029107a`
  approved security but found one P3 product ambiguity: checkout rendered the generic
  read retry beside the closed recovery action. `CartFailureKind.Load` now owns the
  generic read retry; checkout replay and unavailable-product correction render only
  their one specific CTA. Two render tests cover both branches. The superseded hosted
  run `42737660240` was cancelled to release resources. Corrected frontend gates:
  architecture 9/9, lint, **1127/1127**, production build PASS; the non-failing bundle
  warning is 773.93 kB against the 700 kB warning budget. A new exact-head CI and two
  fresh independent reviews remain mandatory.
- 2026-11-09 — Review of `d70f94cce65bb9d092bca2ae5c2513d3f23f7bda`
  found one remaining P3: the initial `Pagar` command remained available beside the
  closed recovery action. `canPay` and the template now admit initial payment only in
  `CartFailureKind.None`; retryable replay and unavailable-product correction each
  expose exactly one operational command. Render coverage asserts the competing
  command is absent and exactly one enabled button/link remains. Superseded Verify
  `42738460008` was cancelled. Corrected gates: architecture 9/9, lint,
  **1127/1127**, production build PASS; the non-failing bundle warning is 774.07 kB
  against the 700 kB warning budget. Exact-head CI and both reviews must repeat.
- 2026-11-09 — Candidate `fd040275806b01999a79836d0cfc5fd80e061f41`
  received two independent GPT-6.1 Sol medium `APPROVE` reviews with no P0–P3.
  GitHub Verify `42738829321` passed backend, frontend and unified-access-real-e2e;
  the previously failing logout cases pass and CI stopped its containers. T07 is
  complete. The WIP is archived with evidence; the documentation-only archive head
  must repeat Verify before merge.
- 2026-11-09 — Archive-head Verify `42740161730` failed two attempts in different
  focus-sensitive specs. The first lost Offers authority; the second rendered no
  authorized Aftercare heading. Both were caused by Angular 22 Vitest's default
  `isolate: false`, which let spec files share DOM, storage and static writer state.
  The unit-test target now sets `isolate: true`; no production component or assertion
  was relaxed. Two complete local suites passed **166 files / 1127 tests**; the
  second full gate also passed architecture 9/9, lint and production build (the known
  non-failing 774.07 kB warning remains). Two independent GPT-6.1 Sol medium reviews
  approved the harness change with no P0–P3. A new exact-head hosted Verify remains
  mandatory before merge.
