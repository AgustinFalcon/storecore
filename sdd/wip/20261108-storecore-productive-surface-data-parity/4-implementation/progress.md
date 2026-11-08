# Implementation progress

## 2026-11-08

- Created the productive parity cut from merged `master` after PR #230.
- Audited the 26-surface Demo manifest against productive Angular routes and
  Spring controllers.
- Confirmed four Demo-only surfaces: recovery, favorites, offers and customer
  administration. Recovery remains explicitly provider-blocked; the other
  three become owned vertical slices in this WIP.
- Recorded overview and locally authoritative data-richness work without
  enabling external providers.
- The first independent Sol product and security reviews returned
  `CHANGES_REQUESTED`. Remediation froze favorite DTO/idempotency/unavailable
  behavior, FAVORITES capability promotion and customer actor authorization,
  offer transition/margin limits, USER CSRF, customer role/PII boundaries,
  transactional suspension/session revocation, overview semantics and the
  per-vertical dual-Sol review protocol.
- Added `surface-data-manifest.json` with all 26 identities, current route,
  endpoint ownership, loader stage and honest coverage residual. Its
  deterministic source-alignment test passed 2/2; PSD-T01 is now actually done.
- The remediated spec requires a new independent review before PSD-T02 GO.
- Two independent Sol reviewers approved the remediated PSD-T02 contract.
- Implemented the productive Favorites vertical end to end: additive V12,
  CUSTOMER capability authorization, idempotent API, Angular HTTP repository,
  closed wire types, account route and product-detail favorite action.
- Remediated review findings for CUSTOMER capability projection, private
  response caching, serialized CSRF-rotating mutations, strict wire mapping and
  fail-closed Unknown availability.
- Final local evidence: frontend `npm run verify` PASS (136 files, 992 tests);
  backend PostgreSQL 16 focal gate PASS (22 tests); both independent GPT-6.1
  Sol code/product and security re-reviews APPROVED with no P0-P3. The real
  browser journey remains owned by cumulative PSD-T08 and is not claimed here.
- Implemented PSD-T03 Local Offers end to end over the existing
  `offers`/`offer_products` authority: ADMIN-only capability checks, USER CSRF,
  atomic create/transition flows, audit events, deterministic winner order and
  no Mercado Libre or external writer.
- Added the productive `/user/offers` Angular surface with HTTP-only data,
  closed status/discount/transition types, strict wire mapping, validation,
  explicit product-wide variant scope and an accessible confirmation dialog.
- Remediated both review rounds: unknown aggregate values now disable every
  action in view and store, finite values remain typed until the HTTP boundary,
  the transition set is not extensible, and the native dialog hides when
  closed, opens after render, handles Escape and restores focus.
- PSD-T03 final local evidence: frontend `npm run verify` PASS (138 files,
  1002 tests plus production build); backend PostgreSQL 16 focal gate PASS (14
  tests); independent GPT-6.1 Sol code/product and security re-reviews APPROVED
  with no P0-P3. The browser/a11y journey remains owned by PSD-T08.
- Implemented PSD-T04 Customer Administration with ADMIN/OPERATOR
  purpose-limited reads and ADMIN-only state mutation. Suspension, revocation of
  all active CUSTOMER sessions and redacted audit commit or roll back together;
  reactivation never restores a previous session.
- Added the productive `/user/customers` HTTP-only Angular surface with closed
  account states/transitions, typed filters, search, pagination, minimal detail,
  role-aware actions and native confirmation dialogs.
- Remediated review findings for delayed responses and filtered pagination:
  detail selection/error/feedback are fenced by identity and generation, the
  current typed query is reconciled after mutation, and an emptied last page is
  clamped and reloaded. Regression tests cover both state filters and 26→25
  record pagination.
- PSD-T04 final local evidence: frontend `npm run verify` PASS (141 files,
  1014 tests plus production build); backend PostgreSQL 16/Spring focal gate
  PASS (5 tests including rollback and lock race); independent GPT-6.1 Sol
  code/product and security re-reviews APPROVED with no P0-P3. Browser/a11y
  remains owned by PSD-T08.
- Implemented the PSD-T05 Operator Overview read model for ADMIN and OPERATOR.
  Period metrics use installation-timezone calendar boundaries while payment,
  fulfillment and low-stock queues remain a current work snapshot independent
  of the selected period. Revenue is correlated to an authoritative APPROVED
  payment and contradictory evidence becomes `UNAVAILABLE`, never zero.
- Added the productive Angular overview with strict HTTP mapping, closed period,
  fact, payment-reason and shipment-state types, explicit unavailable states,
  responsive operational queues and role-aware shortcuts. A known numeric zero
  remains visibly distinct from an unavailable fact.
- PSD-T05 final local evidence: frontend `npm run verify` PASS (architecture,
  lint, 142 files/1023 tests and production build); backend PostgreSQL 16/Spring
  focal gate PASS (6 tests). Review remediations separated period metrics from
  current work, replaced unbounded materialization with exact SQL aggregates
  and bounded queues, required durable correlated payment authority, handled
  reversals/incidents fail-closed, formatted installation-local time, typed
  unavailable reasons and updated the manifest. Independent GPT-6.1 Sol
  code/product and security final snapshot reviews APPROVED with no P0-P3.
  Browser/a11y remains owned by PSD-T08; exact-SHA review follows the commit.
- Audited PSD-T06 against the productive controllers, JDBC repositories, V1
  schema and surface manifest. This is audit/planning evidence only: no T06
  implementation or gate is claimed.
- Recorded the sequential T06 split: A content (SC-SURF-01/16), B catalog and
  inventory (SC-SURF-04/05/17/22), C orders and post-sale
  (SC-SURF-13/14/20/21), and D pricing/channels (SC-SURF-19/23). All four
  subtasks remain pending; the parent T06 is `in_progress` because its audit and
  SDD contract are now active.
- The audit found client/default fabrication in content, missing-inventory
  collapse to zero, raw/orphan payment fallback, incomplete persisted promotion
  projection, collapsed Mercado Libre states and unbounded or N+1 collection
  reads. Each issue is now assigned to exactly one T06 slice.
- Froze the unavailable boundary without inventing provider authority: live
  carrier position/ETA, external provider health, ML fees/rank/competitor data,
  unobserved remote stock/price, margin without cost authority, OAuth validity
  and historical buyer identity not present in the order snapshot remain
  unavailable. Provider secrets remain non-output data.
- Remediated the T06 contract review before implementation. Content now has
  exact per-kind schemas, explicit legacy behavior and an additive singleton
  composition revision for atomic expected-revision replacement. Inventory now
  freezes `onHand=available+reserved`, `saleable=max(available-safety,0)` and
  missing/unknown/available/out-of-stock precedence.
- Froze return eligibility as an informational projection only, with payment,
  delivery and persisted-return precedence and no new CUSTOMER command, right
  or time window. Pricing now exposes only fields backed by its local table and
  defines closed policy transitions and server-owned approval. Non-null channel
  observations are historical with unverified freshness, null observations are
  unavailable, and entity update time is not presented as observation time.
- Completed PSD-T06-B catalog/inventory parity. Product and variant identity,
  closed status, ordered attributes/media, local offer price and exact inventory
  facts now round-trip through bounded pages capped at 50. Missing balances stay
  distinct from known zero; stock formulas and contradictory wire evidence fail
  closed. V14 preserves variant-attribute display order with a canonical legacy
  backfill, while reads use a constant four-query page budget.
- Final T06-B evidence: frontend architecture/lint/build and 149 files with
  1045 tests PASS; Playwright 7/7 covers axe/reflow inventory and SKU-correct
  PDP navigation; backend PostgreSQL 16 focal/migration gates PASS. Independent
  GPT-6.1 Sol code/product and security rereviews approved the same dirty
  snapshot with zero P0-P3 after remediating max-page, truncated and PDP SKU
  findings. The full backend suite ran 235 tests: an isolated identity timing
  rerun passed, while the pre-existing datasource-disabled context test remains
  outside T06-B and must be repaired as a separate commit.

