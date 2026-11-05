# Demo buyer access continuity — local cut

Base: `d1e2513`. Authorized local scope recorded before code on 2026-10-28.
Status: verified locally after favorite-quantity review amendment; focused,
verify, owner and full 81-test rerun PASS. Not promoted.

## Contract

A guest purchase captures the actual PDP selection (canonical variant and
quantity, not stale query values) and normalized catalog filters in a safe URL.
Capture and access resolution are pure step objects with closed outcomes.
The existing return decoder remains the only destination wire boundary, and
the existing product-selection translator validates the restored selection.

Login, register and recovery links preserve this destination. Customer returns
only after successful login; registration requires both successful creation
and successful login before navigation. Admin/Operator retain their current
landings. Missing/unknown registration destination defaults to profile, while
an explicitly valid Home target returns Home. Guest favorite and guarded
customer routes retain a safe route without recording a pending action. PDP
favorites capture the live selection too; a closed capture purpose separates
favorite from purchase stock policy. Any non-purchasable favorite quantity is
omitted, retaining the valid variant and restoring the default quantity after
access. Favorite access is not blocked by stock or a non-purchasable quantity.

Authentication never auto-adds a cart line or favorite. Returning to the PDP
requires a fresh explicit action; stale/invalid quantity or variant cannot be
purchased. No storage key, schema, backend, auth realm or production route is
added. Existing restricted-account/session checks remain authoritative.

## TASK-010 subcut

- [x] Record scope, base, invariant and expected checks before implementation.
- [x] Implement typed capture/resolve/complete steps and natural entry points.
- [x] Propagate links while distinguishing absent return from explicit Home.
- [x] Cover actual Case/2+filters, auth failure, invalid/adversarial input,
  roles, no automatic effects, reload/back and responsive keyboard/Axe.
- [x] Update shared CTA scenario; run unit, verify and owner.
- [x] Finish full Demo gate and record results.

## Current local evidence

### Favorite quantity review amendment (2026-10-28)

UX review correctly found that the initial favorite exception covered only
stockless/default-1, still blocking stock-0/quantity-2 and stock-1/quantity-2.
Closed Favorite policy now omits any quantity rejected by the existing product
selection translator; Purchase still rejects it, and Unknown variant still
fails closed. No second quantity decoder or automatic action was introduced.
Added five unit regressions (stock0/2, stock1/2, NaN, negative, fractional) and
two real browser scenarios verifying return/default1, unchanged local storage,
no cart/favorite mutation until explicit favorite action. Identity focused
6 files / 59 tests PASS at 09:10:06 UTC. Amended verify PASS (81 files / 516
tests, architecture/lint and Real build, 09:11:01 UTC); amended owner13 + SC039
=22/22 PASS in 26.5s. Final Demo build PASS09:12:03 UTC.
Amended full `npm.cmd run test:demo`: **81/81 PASS**, zero unexpected/skipped/
flaky; start 2026-10-28 09:12:03.842 UTC, duration189453.65ms, no retries.
`.last-run.json` passed / failedTests []. Shared CTA inventory PASS.
Final diff check PASS and tasks.json parses. No commit/push. Independent
exact-SHA review remains a promotion gate; no CI/homologation claim.
The 79-test full gate below is retained as historical evidence only.

### Pre-amendment local gates (superseded)

- Identity domain/presentation: 6 files, 54 tests PASS (2026-10-28 08:57 UTC).
- Final `npm.cmd run verify`: architecture + lint PASS, 81 files / 511 tests
  PASS, Real build PASS (2026-10-28 09:01:08 UTC build completion).
- Final Demo build PASS (2026-10-28 09:04:10 UTC).
- Buyer owner 11 + SC03 regression 9 = 20/20 PASS, 25.1 seconds. An initial
  owner assertion expected the wrong existing favorite label (Guardado rather
  than Quitar favorito); corrected test, no product defect hidden by retry.
- Buyer owner covers live Case/2 + normalized filters across login/register/
  recover/reload/back and signup; explicit add after return; live PDP favorite;
  catalog favorite without auto-toggle; cart/checkout access; administrative
  landings; duplicate signup; failed durable signup with unchanged storage and
  successful retry after reload; Restricted/Unknown authorization with byte-equal
  local/session storage; stockless favorite; keyboard and Axe at 320, 390, 768,
  900 and 1440px. Screenshots: `frontend/test-results/buyer-access-continuity-*/`
  (`buyer-login-{width}.png`, `buyer-register-{width}.png`).
- Pure tests cover encoded/external/admin targets using the existing decoder,
  nested query values, stale selection override, invalid variants/quantities,
  purpose Unknown, and registration missing/Unknown vs explicit Home.
- Adapter tests prove failed creation never calls login; false login never
  navigates; success requires both; invalid context/role never authenticates.
- Full `npm.cmd run test:demo`: 79/79 PASS, 0 unexpected, 0 skipped, 0 flaky;
  start 2026-10-28 09:04:11.735 UTC, duration 190084.872ms. Includes shared CTA
  inventory with no unexecuted CTAs. `.last-run.json` passed / failedTests [].
  The first full run was 77/79: the shared SC03 expectation still required a
  query separator for an absent return; that failed assertion restarted the
  worker and reset its inventory sets, causing a second derived afterAll
  failure. Corrected only the absent-return expectation to exact `/demo/login`;
  reran the entire suite without retries, not just failed tests.
- Final lint PASS after test-only failed-write regression; `git diff --check`
  PASS. No source change after final verify beyond test additions/expectation.
- Review changes: live PDP favorite selection, Customer-only return copy and
  distinct stockless-favorite policy. Independent reviews pending final close.

TASK-010 overall and global TASK-013 remain pending. Real cart/checkout/result work remains its own
cut. Historical dirty-tree results are not evidence here. No commit, push,
remote CI, deploy or homologation is included.
