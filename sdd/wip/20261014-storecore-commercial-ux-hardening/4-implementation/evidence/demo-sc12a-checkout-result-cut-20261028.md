# SC12A Demo checkout result — local cut

Base `958769e973021ecd34d983cd0f0605ad5f1f7be6`. Authorized scope recorded
before implementation, 2026-10-28. Status: verified locally after accessibility
amendment of `d5dc4d9`; previous105-test evidence is historical only. Final
exact-SHA independent review remains required; no promotion/CI claim.

## Contract

Dedicated buyer result derives a closed outcome and explicit next action only
from the authorized persisted order, never the shell scenario or URL outcome.
Payment/order/shipment remain independent. Unknown, inconsistent, refunded and
charged-back facts never invent finality or expose destructive actions. Foreign
and missing orders have the same safe presentation. Reads/reloads do not write.

One pure policy supplies shipment for new checkout and explicit pending-payment
resolution/cancellation: Approved→Preparing, Pending→Pending,
Rejected/Cancelled→Cancelled. Do not rewrite legacy records or change schema.
Legacy inconsistencies remain visible reconciliation cases without mutation.
Historical lines/totals/delivery are not repriced from the current catalog.
Unknown legacy shipping fee is disclosed, not inferred as free delivery.

Primary result actions are explicit navigation to order detail, orders/catalog
or cart recovery through the existing detail workflow. Result rendering never
auto-pays, auto-retries, auto-adds or changes stock. Existing mutation authority,
writer/CAS and actor/session checks are preserved. Pickup has no postal tracking
claim; no provider, fiscal or actual shipping/payment activation is included.

- [x] Record scope/base/contract before source changes.
- [x] Closed outcome/presenter and narrow shipment policy with tests.
- [x] Dedicated result UI, actor isolation, explicit actions and accessibility.
- [x] Owner E2E and shared CTA/regression updates.
- [x] Amended verify/builds/full Demo and honest evidence closeout.

## Local checks and review amendments

### Heading-focus amendment

Exact-SHA UX review reproduced Confirmar→resultado leaving activeElement BODY.
The result now focuses its authorized h1 after render on entry, order-ID changes
and outcome changes; scenario-shell-only changes must preserve the user's focus.
Component and real-browser journey/direct/reused-route regressions were added. Gates
below remain historical until the amended source is validated; no assertion
will be weakened or replaced by manual focus in the test.

- Focused result/component:2 files /9 tests PASS10:07:51UTC, including actual
  rendered DOM focus and ID/outcome changes; same-outcome and shell changes do
  not steal focus.
- Amended verify: architecture/lint PASS,85 files /539 tests PASS; Real build
  PASS10:08:44UTC. OwnerSC12A11 +SC11A12 =23/23 PASS41.8s. Browser assertions
  cover Enter on actual Confirmar→focused h1, direct reload, reused result ID,
  missing ID and scenario-select focus retention without manual heading focus.
- Full amended `npm.cmd run test:demo`: **106/106 PASS**,0 unexpected/skipped/
  flaky; start2026-10-28 10:09:58.228UTC, duration236790.398ms, no retries.
  Final Demo build PASS10:09:57UTC; `.last-run.json` passed / failedTests[].
  Shared CTA inventory and existing checkout/SC26 regressions pass unchanged.
- Final diff check PASS. No product-source edits after these amended gates,
  only SDD closeout. No commit/push, backend/schema change or external write.

### Historical pre-focus-amendment gates

- Focused checkout/result plus safe-return: 8 files /70 tests PASS,
  2026-10-28 09:52:04UTC. Final verify includes the subsequent component test.
- Verify: architecture/lint PASS,85 files /538 tests PASS; Real build
  PASS09:55:56UTC. Initial lint caught an unused test import, corrected before
  this clean verify; no source/domain assertion was weakened.
- SC12A owner10 + SC11A regression12 =22/22 PASS41.3s. Covers persisted
  outcomes independent of shell/query/reload; explicit pending decisions only
  in detail; new shipment coherence; owner/foreign/missing/admin/guest isolation;
  legacy inconsistent/Unknown/refund/chargeback review and zero read writes;
  pickup/no postal claim; unknown legacy fee;5width keyboard/reflow/Axe.
- UX/Security P2: legacy subtotal greater than total previously passed when no
  delivery field existed. Now Review even with unknown shipping; positive
  difference never fabricates a fee. Regression100×2,total100 and browser case
  added. Review/Unknown never expose the postal-tracking signal.
- Param-map is reactive for reused result routes; component tests prove ID and
  actor/realm changes cannot leave a cached foreign result. The safe-return
  boundary gains one closed Result case plus encoded-path regression so guest
  access returns here without a parallel allowlist or cross-realm navigation.
- Shared CTA inventory includes the new result template and executes all its
  owned/guest/missing actions. Earlier checkout receipt/payment tests now
  explicitly navigate to order detail before those unchanged actions; an old
  Cancelled·Preparing assertion now expects the corrected Cancelled shipment.
- Final `npm.cmd run test:demo`: **105/105 PASS**,0 unexpected/skipped/flaky;
  start2026-10-28 09:57:20.505UTC, duration232782.646ms, no retries.
  `.last-run.json`: passed / failedTests[]. Shared CTA inventory includes the
  dedicated result template and has no unexecuted controls.
- Final Demo build PASS09:57:19UTC. Final verify and owner evidence above uses
  the same product source; only this SDD closeout changed afterward.
- Five-width captures:
  `frontend/test-results/result-sc12a-SC12A-responsive-keyboard-and-Axe-{width}/result-pending-{width}.png`,
  widths320/390/768/900/1440. This is local responsive/Axe evidence for SC12A,
  not global WCAG certification or a full26-surface visual/homologation gate.
- Final diff check PASS; tasks JSON parses. No commit/push or external changes.

TASK-011 and global TASK-013 remain pending. SC13 chronology and SC14 partial
returns/refunds remain separate aggregates/cuts. No backend, storage/schema,
mass migration, commit/push, deploy, CI or homologation claim is authorized.
