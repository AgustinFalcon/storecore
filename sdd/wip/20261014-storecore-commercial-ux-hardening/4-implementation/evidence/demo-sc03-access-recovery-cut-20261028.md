# SC03 Demo access recovery — promotion cut

Base: `a65115f`. Scope authorized for local implementation on 2026-10-28.
Status: implemented and verified locally; exact-SHA promotion reviews remain separate.

## Exact-SHA review amendments after `d706a9e`

Review found two P2 gaps; the initial green checks did not certify them:

1. A purchase return retained its URL but the PDP reset its actual selection to
   Standard/1. The owner E2E used a variant absent from this base and asserted
   only the URL. The correction adds one pure product-selection URL translator,
   reuses canonical `DemoProductVariant`, applies it on query/SKU navigation and
   rejects unsupported variants/invalid or excessive amounts without clamping
   or mutating the cart. Unknown displays the closed type's label.
2. URL parsing normalized encoded dot segments before their validation. Raw path
   percent syntax and dot segments are now rejected before constructing a URL;
   query values remain opaque so valid purchase parameters survive.

Regression contract: Case (`with-case`) × quantity 2 must survive recovery,
ordinary CUSTOMER login and reload, then produce that actual variant/amount in
the cart. Unsupported variant/presentation and invalid stock/fractional amount
must preserve the cart. `%2E%2E`, `%2e%2e`, `%2e.`, `.%2e` and double-encoded path
specimens map to Unknown/Home before normalization. Admin/Operator keep their
existing landing pages.

Amendment tests: focused 5 files / 52 tests PASS; `verify` PASS with architecture
6/6 and scan, lint, **75 files / 476 tests** and production build at 08:03:32 UTC.
Demo build PASS at 08:03:35 UTC. Chromium owner SC03 **9/9 PASS**, including
actual Case/2 selection, reload and cart, invalid/unsupported selection without
mutation, all three encoded-dot spellings and five-width keyboard/Axe/reflow.
The earlier 53/53 below belongs to pre-amendment code. Final amended
`npm run test:demo`: rebuild at 08:05:01 UTC and full **54/54 PASS** in 2.6 min,
including the entire CTA matrix, SC03 owner tests, PDP/cart/navigation
regressions, SC26 and transactional persistence. No retry, skipped or flaky
cases. Final `git diff --check` PASS. New exact-SHA reviews are required after
committing this correction; the old approvals are not carried forward.

## Contract and technical plan

`/demo/recover` is a dedicated, public Demo surface. It discloses that no email,
credential, account permission or session is changed. Arbitrary syntactically
valid emails receive the same neutral result. Request, submitting, sent,
invalid/expired/used token, completed, service error and Unknown are closed
phases; labels, descriptions and eligibility belong to that type.

Request and simulated outcome are separate step objects. A pure flow orders
them, owns cancellation/generation and accepts a scheduler port. Angular only
adapts signals, input and navigation. A stale request cannot replace a newer
outcome or survive destruction/context change. Retry retains the email.

The only return decoder permits known customer Demo paths, preserves purchase
query parameters and falls back to Home for unsupported/external/internal-user
destinations. Recovery never logs in. After ordinary Demo login only CUSTOMER
may consume that destination; Admin/Operator keep their existing landing.

## TASK-010 / SC03 promotion subtasks

- [x] Record current scope, base, architecture and acceptance before code.
- [x] Implement closed phase, step objects, flow and safe destination decoder.
- [x] Wire dedicated surface and login continuity without copying dirty-tree
  session, catalog, operational models or route table.
- [x] Test phases/Unknown, neutral result, invalid email, duplicate submit,
  retry, stale callback, destruction/context change and safe destinations.
- [x] Run local verification and browser checks; record actual results below.

TASK-010 overall remains pending. Historical 20261020 60/60 or later dirty-tree
results are provenance only, not evidence for this cut. SC22–26, backend,
BlackStore, remote CI, final visual/review gates and homologation are outside
this local implementation. No commit, push or PR is included.

## Current execution evidence

- Targeted Angular: 4 files / 33 tests PASS.
- `npm run verify`: architecture 6/6 and scan, lint, 74 files / 457 tests,
  production build PASS at 07:49:57 UTC.
- Demo build PASS; final mobile disclosure override included by the rebuild at
  07:50:55 UTC (latest rerun rebuild at 07:54:01 UTC).
- Targeted Chromium SC03: 8/8 PASS. Includes all phases/Unknown, neutral known
  and arbitrary emails, no fetch/XHR or local/session snapshot changes, stale
  timer after completion and destruction, safe customer return, preserved
  Admin/Operator landings, keyboard, no horizontal overflow and zero Axe
  violations at 320/390/768/900/1440. Five PNGs under `frontend/test-results/`.
- First full Demo run: 51/52 PASS. The shared CTA inventory's `afterAll`
  correctly rejected the new `login-recover-link`, executed by the owner SC03
  suite but not yet by the inventory suite. Added an actual SC03 scenario to
  that suite (link, request, each outcome and login); no assertion weakened.
  Final `npm run test:demo` rebuild plus full rerun: **53/53 PASS** in 2.5 min,
  including the complete shared CTA matrix, the SC03 owner suite, SC26 and
  transactional persistence. This run uses the final typed context cases and
  mobile disclosure override. No retries or skipped cases.
- Final lint and `git diff --check` PASS after the shared-inventory test change.
- Independent Astra UX/UI/Product inspection: provisional APPROVE with no
  P0–P3 open after moving the login link into its form, fixing the intermediate
  responsive column and retaining the disclosure on mobile. This is a local
  working-tree review; it is not the repository's exact-SHA promotion gate.

Environment: initial sandbox Angular invocation could not resolve ancestor
directories. The same tests/builds passed using the approved local execution
permission. Dependencies reuse a local junction to the prior worktree's
`node_modules`; package/lock files are unchanged. No network install occurred.
