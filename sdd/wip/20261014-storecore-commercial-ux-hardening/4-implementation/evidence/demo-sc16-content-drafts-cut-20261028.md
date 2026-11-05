# SC16 Demo content draft cut

Base: `45b231b`. Authorized local implementation on 2026-10-28.
Status: implemented and verified locally; exact-SHA promotion reviews remain separate.

## Scope and invariant

The editor saves only `contentDraft` in snapshot v3. The current Home fields
`title`, `subtitle`, `blocks` are unchanged by edit, preview, save or discard.
Schema v1 customer migration is preserved, followed by v2→v3 content migration:
only an absent legacy draft is initialized from Home, with cloned blocks. v3
missing/invalid draft and explicit malformed legacy drafts fail closed.

Admin context plus canonical UserRole Admin or Operator may edit SC16. This
does not broaden any other route or reset authority. A pure closed phase/issue
model and flow step objects separate validation, preview, save and discard.
The adapter uses the existing writer lock, snapshot transaction and readback;
there is no separate storage key or publish operation.

Preview renders the unsaved buffer in the storefront composition. Viewing the
current store is a separate guarded navigation. Dirty navigation shares one
decision, supports cancel/discard, Escape, focus restoration and native unload
warning. Saving serializes writes; session epoch/generation invalidates older
work even after logout/login as the same actor. Failed persistence retains the
buffer and never exposes success or modifies Home.

## TASK-013 SC16 subtasks

- [x] Record contract, base, limits and acceptance before implementation.
- [x] Add closed draft/phase/authority and pure step flow with tests.
- [x] Add snapshot v3 migration, validation and transactional draft adapter.
- [x] Route dedicated editor/preview/dialogs with leave guard and scoped styles.
- [x] Update CTA coverage to stop asserting that draft save publishes Home.
- [x] Run focused tests, verify, owner browser and full Demo; record results.

TASK-013 overall remains pending. SC15, Real content, rich banner/category
controls, SC22–26 changes, backend, BlackStore, CI and exact-SHA promotion reviews
are outside this cut. Historical dirty-tree evidence is not reused. No commit,
push, PR, deploy or homologation is included.

## Executed checks and review amendments

- Existing state/customer/persistence regression checks: 3 files / 23 tests PASS.
- SC16 domain/flow/persistence/lifecycle checks: 4 files / 19 tests PASS. Covers
  closed Unknown, clone/reorder, v1/v2 migration, v3 missing/null/malformed and
  duplicate IDs, draft/Home isolation, writer denial/quota/stale tab, repeated
  leave decision, destroy-before-commit and logout/login as the same actor.
- Final `npm run verify`: architecture 6/6 plus scan, lint, **79 files / 495
  tests** and Real build PASS (08:35:49 UTC), including native unload and every
  closed discard-intent case after the CSS correction below.
- Demo rebuild at 08:30:34 UTC PASS; owner Chromium **12/12 PASS** in 18.7 s.
  Covers preview with real SVG media/effective prices/categories, save/reload
  without Home publication, cancel/discard/navigation, field association and
  focus, keyboard reorder/announcement, write failure/retry, scoped Operator
  authority/logout, and two-tab read-only/ownership transfer. At
  320/390/768/900/1440: editor, preview and discard Axe zero violations and no
  viewport/dialog overflow; editor/preview/top/products/discard PNGs are local
  `frontend/test-results/content-sc16-*/content-*.png` artifacts.
- Review identified field errors lacking association, preview using placeholder
  art/omitting composition, rounded prices, keyboard reorder focus/announcement,
  and implementation-oriented copy. All corrected before the owner run. The
  shared Home/preview image and money helpers preserve current semantics and
  decimal minor units; regression includes 10099 cents.
- A visual review then found inherited `small { display:block }` overriding
  `hidden` on validation messages. `.field-error[hidden] { display:none }` plus
  actual visibility assertions and regenerated captures close that gap. Prior
  owner greens without this assertion are not reused as final validation.
- Astra UX/UI/Product/A11y provisional APPROVE: 0 P0–P3 open after reviewing
  corrected editor and scrolled product-preview captures at 320/1440. This is
  working-tree evidence, not an exact-SHA promotion review or global WCAG claim.
- Shared CTA inventory now executes preview close, local discard, leave
  cancel/confirm and current-store navigation. Older assertions that draft save
  mutates Home were replaced with draft-preview and unchanged-Home assertions.
- Final `npm run test:demo`: rebuild at **08:32:46 UTC**, full **67/67 PASS** in
  3.0 min, no skipped/flaky/retries. Includes owner SC16, shared CTA inventory,
  SC03 purchase-return regressions, SC26 migration/access and transactional
  persistence. No product source changed after this Demo build; the final
  verify added only a native-unload unit regression. `git diff --check` PASS.
  No remote CI has run. New exact-SHA reviews must inspect the committed cut;
  provisional working-tree reviews do not satisfy the promotion gate.
