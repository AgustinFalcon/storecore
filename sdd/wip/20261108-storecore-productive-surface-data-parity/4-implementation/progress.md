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

- 2026-11-08 — PSD-T06-C implemented. CUSTOMER and USER order projections now share a bounded max-50 page contract while preserving realm isolation and deterministic ordering. Payment facts are derived from correlated commercial application, checkout attempt and payment evidence; orphan, crossed, ambiguous or unresolved evidence fails closed in reads and aggregate-locked fulfillment writers. Timeline, delivery snapshot and return eligibility use closed types, explicit unavailable states and purpose-limited output without actor, audit or provider payload leakage. Backend PostgreSQL 16 focal gate PASS (43 tests). After two P2 review remediations, frontend verify PASS (architecture, lint, 152 files/1055 tests, production build), focal mapper/policy tests PASS (33/33) and focal Playwright PASS (4/4: CUSTOMER 390/768/1440 with axe/reflow plus USER pagination). Independent GPT-6.1 Sol code/product and security dirty-snapshot rereviews APPROVED with zero P0-P3. No external provider or homologation claim is made.

- 2026-11-08 — PSD-T06-D implemented. Manual price policies now expose only persisted local authority, use closed DRAFT/ACTIVE/PAUSED/ENDED transitions and assign approval evidence exclusively on the server. Activation validates the database clock, price/window invariants and overlap under transaction and aggregate locks; a PostgreSQL race test proves that two concurrent sessions cannot establish competing active authority. Mercado Libre projections keep desired local state separate from historical observations: non-null observations are explicitly `UNVERIFIED`, absent observations are unavailable, and entity update time is never relabelled as observation time. ADMIN, capability, origin and CSRF boundaries are covered without emitting secrets, OAuth assertions, competitor facts or external writes. Backend PostgreSQL 16 focal gate PASS (22 tests). Frontend verify PASS (architecture 9/9, lint, 154 files/1061 tests and production build); focal Playwright PASS (12/12 at 390/768/1440 with axe/reflow, including navigation across 26 mappings and failed-page retry). The Playwright gate uses controlled HTTP responses and does not claim live Mercado Libre integration or homologation. The production build retains a non-failing initial-bundle warning of 739.19 kB against a 700 kB budget.

- 2026-11-08 — PSD-T07 implementation prepared for independent review. The
  loopback-only API loader adds ordered FAVORITES, OFFERS,
  CUSTOMER_ADMINISTRATION and OVERVIEW step objects, with closed wire types and
  fail-closed Unknown handling. The manifest assigns the four corresponding
  surfaces to those stages. No production domain or migration changes are made.
- Before any domain/capability write, preflight verifies MP is unconfigured,
  external checkout is disabled and MARKETPLACE_ML, ML_PRICE_AUTOMATION,
  ML_PROMOTION_ORCHESTRATOR, ML_COMPETITION_INSIGHTS, ML_VIRTUAL_KITS, CARRIERS
  and BLACKSTORE_INTEGRATION are DISABLED. The entire local activation plan,
  including positive Int config versions, is validated before its first write;
  external safety is checked again at completion. Configured external modules
  cause an abort, never automatic deactivation.
- Ownership/replay: existing SHOW-* products are read with the ADMIN detail
  endpoint, including inactive products, and never overwritten. Only products
  created in this execution receive strict create-response and final-readback
  checks: product/variant/media identities, written name/description/facets,
  closed active states, base/original/effective price, ordered primary media and
  known inventory quantities/formulas/availability. The final balance accounts
  for this run's one pending-checkout reservation. Preexisting products receive
  no fixture fingerprint, preserving operator changes. The catalog price
  contract exposes no currency field; this loader does not invent one. Home uses the
  T06 revision/sections contract and seeds showcase-home-v1 only into an empty
  composition; any operator/unknown legacy composition is preserved. Existing
  addresses and nonempty carts are reused untouched. First pending checkout
  requires an empty cart, retains the stable per-customer idempotency key and
  verifies receipt identity plus the persisted pending order and its exact line.
  Order/customer reads consume validated pages (maximum 100 pages; 50 rows per
  order page, the existing 25-row customer page), rejecting inconsistent totals,
  duplicate identities and incomplete pages before inferring absence.
- Favorites add only the reserved showcase SKU and retain unrelated relations.
  A single SHOWCASE_LOCAL_OFFER_V1 draft with exact SHOW-only scope is created
  or reused; existing state/window/discount edits are preserved, while ownership
  ambiguity fails closed. Offers are never activated. The captured offer fields
  must survive readback. The known offer-create HTTP 201/envelope 200 exception
  is opt-in only at that call; other status/envelope mismatches remain errors.
  CUSTOMER /me identity is verified before CUSTOMER writes. Admin customer
  search/detail and overview reads validate real contract shapes, closed states,
  unavailable facts and queue invariants without changing customer state or
  inventing installation totals.
- Evidence is a stateful real-loopback HTTP fake, not PostgreSQL/Spring/Angular
  integration. Tests exercise loader.run first load and replay, zero replay
  writes, operator preservation, later customer/order pages and over 100
  unrelated catalog products, realm cookies/rotating CSRF, rejection without
  mutation retries, strict status/envelopes, corrupt readbacks and nonempty-cart
  checkout protection. Final local gate PASS: node --test
  scripts/showcase/load-storecore-showcase.test.mjs
  scripts/surface-data-manifest.test.mjs ran 71/71 tests (69 loader, 2 manifest)
  in 26.81 seconds after product-readback remediation, including 14 product
  corruption regressions. git diff --check PASS. These are the executed T07 gates;
  frontend production verification and real database/browser gates were not run
  for this loader-only cut.
- Limits: sequential loader runs only. Offers have no API create-idempotency
  key, so concurrent loaders can create duplicates; create-only product checks
  also have a concurrent operator-create race without a create precondition.
  No tombstone exists to distinguish intentional removal of a seeded favorite:
  add-only replay may restore that reserved relation. Pending-order ownership
  uses the exact SHOW SKU/quantity in the dedicated synthetic customer; multiple
  matches abort. Unknown home blocks are preserved by skipping replacement,
  rather than trying to round-trip unsupported write schemas. Paging over the
  bound aborts without treating unseen rows as absent. The final contract gate
  passes 71/71 checks (69 loader plus 2 manifest), including exact readback of
  products created by the run while preserving pre-existing operator changes.
  Independent GPT-6.1 Sol code/product and security rereviews APPROVED the
  remediated dirty snapshot with zero P0-P3. PSD-T07 is done;
  real-database/browser/migration execution remains PSD-T08. No provider
  activation, deployment or homologation is claimed.

## 2026-11-08 — PSD-T08 local real integration gate (reviews pending)

- Working snapshot is dirty over base/head
  `31e030926229ae9bd185776cef0843eae8bbfa91`; no commit or CI success is claimed.
  PSD-T08 remains `in_progress` until independent reviews and cumulative close-out.
- Added `frontend/scripts/run-psd-real-e2e.mjs`, dedicated Playwright config,
  TypeScript/lint gate and eight real API browser cases under `e2e-psd-real`.
  Existing UA/CFE discovery remains separate at 17 cases; its provider simulator
  is not used by PSD. The runner rejects non-PG16, non-loopback, wrong database
  name, nonempty public schema and occupied application ports.
- The runtime starts the freshly packaged Spring jar and updated showcase loader
  under the unchanged ShowcaseConfig HTTP-only boundary, then stops Spring and restarts over the same database with
  HTTPS installation Origin. Production Angular uses the optimized production
  configuration; separately built Demo runs on its own static server. No loader
  protocol boundary or production authentication/rate-limit rule was relaxed.
  Browser DNS permits loopback only, so fixture media cannot call remote hosts.
- Initial real loading found a contract gap hidden by T07 fixtures: the console
  correctly omits BlackStore, but loader safety incorrectly required its console
  row. The ADMIN-only safety endpoint now projects seven closed external-module
  states from the capability authority, including hidden BlackStore, with
  `UNKNOWN` on missing/duplicate authority and `Cache-Control: no-store`.
  It exposes only adapter mode, checkout-disabled and module/state pairs, with
  no credentials, config version, OAuth or provider-health fields. The console
  continues hiding BlackStore. Loader fixtures now reproduce that separation;
  missing/duplicate/unknown/active external safety fails before domain writes.
- HTTP/payload safety gate PASS **4/4** on PostgreSQL 16: anonymous/CUSTOMER
  rejected 401, OPERATOR rejected 403, ADMIN reads 200 without mutation CSRF or
  Origin, strict minimal keys and noncacheability, plus closed missing/duplicate
  cases. Command: `mvn -B
  -Dtest=ShowcaseSafetyPayloadTest,ShowcaseSafetyHttpIntegrationTest package`.
- Migration matrix PASS **18/18** on PostgreSQL **16.14**: clean V1–V14,
  V11→V14 historical catalog/checksum/backfill/no-op, V13→V14 historical identity,
  V8→V9 definer and V10 session-administration migrations. Command:
  `mvn -B -Dtest=CoreSchemaMigrationTest,CatalogAttributeOrderMigrationTest,CfeBaselineUpgradeMigrationTest,CapabilityDefinerMigrationTest,CapabilitySessionAdministrationMigrationTest test`.
  The older task wording V1–V12 is corrected to the actual current V14.
- Real loader first load and replay each passed all **14 stages**. Assertions
  verified first pending-order creation, replay reuse, stable order count and
  inventory, and preservation of an unrelated offer created through the API.
  Final database: migration 14, exactly one order; SHOW-TALADRO-18V has
  `11 available + 1 reserved`, SHOW-AMOLADORA-850 `8 + 0`, SHOW-SET-MANUAL
  `15 + 0`; all seven external capabilities remain `DISABLED`. MP adapter was
  explicitly `unconfigured`, confirmed again after HTTPS restart.
- Real Spring/Angular HTTPS Chromium gate PASS **8/8** in **17.4 s**:
  favorites remove/add/reload; offer create/end/reload; OPERATOR customer/overview
  reads and forbidden state mutation; foreign-realm CSRF rejection preserving
  sessions; customer search/detail/suspension/reactivation with old sessions
  remaining revoked; authoritative overview/inventory plus axe/reflow at
  390/768/1440; API-driven Production and isolated Demo entrypoints. No API
  interception or provider simulator was used. Browser evidence lives in ignored
  `frontend/psd-real-results/` (report and playwright.log).
- Real axe found overview date-range text at 4.39:1 contrast on the canvas;
  changed that single rule to the existing muted-ink token. All three responsive
  axe cases now pass. Test-only fixtures separate safety and browser ADMINs so
  the normal bounded login-attempt budget remains intact.
- Final `npm run verify` PASS: architecture **9/9** plus scan, lint, Angular
  **154 files / 1061 tests**, optimized production build. Production initial
  bundle **739.19 kB** retains a warning against the 700 kB warning threshold,
  below its 900 kB error threshold. `npm run build:demo` PASS, initial **1.92 MB**
  with its existing 1.90 MB warning / 2 MB error thresholds. `showcase:test`
  PASS **73/73**; `check:psd-real` passes syntax, TS, eslint and eight-case
  discovery. `check:ua-real` passes unchanged 17-case discovery. Diff check PASS.
- All tracked Spring/Angular/Demo/Playwright children and scratch certificates
  were cleaned by the runner. Only the explicitly created disposable container
  `storecore-psd-t08` was removed. Final ports 5434/8080/4301/4390 have no listeners;
  no operator PostgreSQL service or unrelated process was stopped.
- Limits: local, sequential safety snapshots are not atomic locks against
  concurrent ADMIN changes. This targeted browser suite does not claim every
  PSD-T06 field/transition or the full Demo regression suite; those retain their
  owning focal/domain/HTTP gates. No live vendor calls, payment accreditation,
  fiscal/carrier certification, deployment, CI, release or final review approval
  is claimed. Runbook: `docs/testing/productive-surface-real-e2e.md`.
- Independent GPT-6.1 Sol code/product and security reviews APPROVED the same
  final dirty PSD-T08 snapshot with zero P0-P3. PSD-T08 is done; cumulative
  exact-SHA reviews remain owned by PSD-T09 and PSD-T10.
- The first cumulative PSD-T09/T10 review of exact SHA `60632dd` returned three
  P2 findings and one P3: Overview could trust a valid credit alongside an
  additional orphan terminal payment, FAVORITES capability authorization could
  commit outside the mutation transaction, order projections with historical
  buyer/delivery data lacked `no-store`, and offer product status still crossed
  the JDBC boundary as a string. Cross-surface review also found that a resolved
  reversal without correlated commercial application was excluded by Overview
  while the order projection failed closed.
- Remediation now aligns Overview with the T06-C payment/reversal authority,
  moves FAVORITES capability decisions into the CSRF-coordinated mutation,
  applies `Cache-Control: no-store` to all four order reads and maps offer
  product status through the closed `ProductStatus` type. A single sequential
  PostgreSQL 16.14 gate passes 27/27 tests across commerce HTTP/concurrency,
  Overview, offers, closed catalog state and architecture. Cumulative exact-SHA
  reviews must be repeated; no prior approval is reused.
- Final cumulative GPT-6.1 Sol code/product and security reviews APPROVED exact
  code SHA `1a563cdc8c441810c62a77517540019419d82967` against base
  `e8d2dcd5699f4c578857b2b4013ebe13cbb66d20` with zero P0-P3. PSD-T09 and
  PSD-T10 are done. The feature is implemented locally; CI, PR integration,
  deployment and external-provider homologation remain separate release work.
