# Implementation progress

- 2026-11-14: backlog and current code reconciled against `master cd90726`.
- 2026-11-14: functional/technical specs and task plan drafted for independent
  product/bug and security review.
- 2026-11-14: first parallel GPT-6.1 Sol reviews returned CHANGES_REQUESTED. Both
  identified the missing authentication epoch fence and exact CAS error-code
  classification; the combined review also closed timeout/malformed response,
  independent read/write sequencing, transition graph, focus and the lack of
  durable UUID recovery. Specs updated without changing runtime.
- 2026-11-14: parallel GPT-6.1 Sol re-reviews (Product/Bug/UX and Security)
  returned APPROVE with no residual P0-P3. CCC-T01 implementation authorized.
- 2026-11-14: CCC-T01..T04 implemented in the frontend only. The cut adds the
  closed transition graph, immutable command intent, mutation phase/policy,
  exact HTTP boundary, epoch/read/write fencing and the accessible ADMIN editor;
  OPERATOR remains read-only. No backend, DDL or capability default changed.
- 2026-11-14 local evidence on the working diff:
  - focused Angular matrix: 7 files / 82 tests PASS;
  - `npm run verify`: architecture 9/9, project-service smoke 3/3, lint,
    216 files / 1465 tests and production build PASS;
  - Playwright/axe `admin-capabilities.spec.ts`: 8/8 PASS at 390/768/1440,
    including ADMIN command, OPERATOR read-only, focus restoration and no
    serious/critical axe findings;
  - `git diff --check`: clean (line-ending notices only).
- Exact-diff reviews, commit, PR, hosted Verify, merge and post-merge Verify:
  pending.
- 2026-11-14 first implementation exact-diff reviews returned CHANGES_REQUESTED:
  both reviewers demonstrated that the uncertain fence was component-local and
  disappeared after navigation/reload, including destruction during Saving; the
  Product/UX reviewer also found focus restoration could target a detached row
  after same-principal reauthentication. A persistent same-epoch journal and
  connected-trigger focus fallback are required before re-review.
- 2026-11-14 correction implemented: a root/sessionStorage journal records the
  strict intent before dispatch and restores a same-epoch route/reload as locked
  `ResultUncertain`; component destruction during Saving cannot clear it. A new
  authentication epoch clears the old barrier. Malformed storage is normalized to
  a same-epoch fail-closed marker. Focus now falls back to the page heading when
  the original trigger is detached or disabled.
- Corrected-diff evidence: focused matrix 8 files / 93 tests PASS; full verify
  architecture 9/9, project-service smoke 3/3, lint, 217 files / 1476 tests and
  production build PASS; Playwright/axe 8/8 PASS at 390/768/1440; diff check clean.
- 2026-11-14 corrected exact-diff re-reviews: independent GPT-6.1 Sol
  Product/Bug/UX and Security reviewers both returned APPROVE with no residual
  P0-P3. Repository hygiene tests 11/11 and tracked-file scan PASS.
