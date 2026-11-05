# SC11A Demo checkout delivery/review — local cut

Base: `839ddd9a32b1027657db8a4ec5e9640da5532b76`. Scope authorized by the user
and recorded before implementation, 2026-10-28. Status: verified locally;
not promoted. Exact-SHA independent review and remote CI remain separate gates.

## Contract and plan

Keep three steps: Destination, Delivery, Review/payment. Reuse the existing pure
DemoCheckoutFlow and its stage objects, not the incompatible rich checkout/cart
model. A closed DeliveryConfirmation owns explicit acceptance of an immutable
delivery quote. Changing destination, method, cost or days invalidates acceptance;
returning without changes preserves it. Changing a selector never confirms it.

One pure delivery quote supplies UI and new order.delivery using the existing
snapshot shape, with no schema/storage/backend change. Review shows actual
variant, quantity, unit/subtotal, destination, days, shipping cost and total.
Destination is editable and reversible. Home shows addresses/create; Pickup
shows only the disclosed demo pickup point. Empty cart cannot advance or pay.
New checkout address is selected after successful durable save.

Errors associate with their control/group and focus the invalid input. Step
changes focus their heading after render; progress exposes aria-current=step.
Processing remains disclosed simulation, duplicate/cancel/destroy/session epoch
and durable writer checks are preserved. Final submission revalidates accepted
facts, not just a boolean. No new provider/payment outcomes, rich pickup policy,
Real route changes, remote operations or homologation claims.

- [x] Record SDD scope before source changes.
- [x] Quote/confirmation/flow closed domain + unit tests.
- [x] UI/review/empty/errors/focus and command quote reuse.
- [x] Owner E2E, shared CTA and affected regressions implemented.
- [x] Verify, builds, full Demo and honest evidence closeout.

## Current checks and review amendments

- Checkout focused: 6 files / 30 tests PASS at 2026-10-28 09:37:27 UTC,
  including real Angular lifetime/duplicate/cancel/destroy/epoch/drift/run-false.
- Verify: architecture/lint PASS, 83 files / 529 tests PASS and Real build
  PASS09:36:23 UTC after final Ready-on-entry and actor/epoch acceptance binding.
- Initial owner 11/11 PASS21.1s, including Home/Pickup review/order/receipt,
  storage failure, stale snapshot, reversible explicit confirmation, new address,
  keyboard/Axe and captures at320/390/768/900/1440. Amended owner12/12 PASS25.6s
  adds second-tab checkout rejection/ownership transfer and initial Ready status
  assertion. Final source also includes all12 passing within the full94 rerun.
- UX fixes: compact sticky per-stage total with focus visibility guard;
  valid Home modality is not aria-invalid when only the address is missing.
- Inspection found inherited constructor cancellation mislabeled a fresh review
  as Cancelled; session initialization now clears the timer and resets Ready.
  Explicit user cancellation still shows Cancelled. Epoch resets acceptance.
- Acceptance fingerprint includes actor ID, session epoch and SKU/variant/qty/
  effective unit price. Same-actor fresh login invalidates before an effect runs.
  Deferred submission compares captured delivery/cart facts again before writing.
- Initial full93 runs on earlier Demo build: one legacy CTA expected Edit cart
  even with an empty cart. The intentional empty guard now offers catalog only;
  expectation updated, and Edit cart is executed on a populated checkout in the
  shared inventory. A worker restart also loses earlier inventory executions,
  so its derived afterAll failure is not a second product defect. That initial
  run ended91/93, two failed; it is not current green evidence.

## Final browser evidence

- Final `npm.cmd run test:demo`: **94/94 PASS**, zero unexpected, skipped or
  flaky; start2026-10-28 09:36:27.393UTC, duration216187.715ms, no retries.
  `.last-run.json`: passed / failedTests[]. Shared CTA inventory has no
  unexecuted controls; all deterministic outcomes and SC26 regressions pass.
- Final Demo build PASS09:36:26UTC; final verify/Real build and checkout focused
  results above apply to the same source. No source edits after these gates.
- Five-width evidence under `frontend/test-results/checkout-sc11a-SC11A-keyboard-responsive-steps-and-Axe-{width}/`:
  `checkout-destination-{width}.png`, `checkout-delivery-{width}.png` and
  `checkout-review-{width}.png`, widths320/390/768/900/1440.
- Owner12 scenarios cover explicit confirmation/no automatic selection,
  Home/Pickup final totals/quote versus persisted order and receipt after reload,
  invalid focus/aria association, unchanged-back versus method roundtrip,
  empty checkout, new durable address selection, duplicate/cancel/destroy/logout,
  quota rollback, CAS conflict, read-only second tab and writer transfer,
  responsive reflow and Axe. Money uses the existing formatter.
- `git diff --check` PASS. No commit/push, deployment, backend/schema change,
  provider activation, CI or global WCAG/Stitch/homologation claim.

TASK-011 and global TASK-013 remain pending. SC10 conflicts, SC12 result redesign,
rich variant/pickup inventory and Real checkout are separate cuts. Existing
legacy orders without optional delivery remain supported. Final exact-SHA dual
independent review and remote CI are not certified by this local implementation.
