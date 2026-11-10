# Product/Bugbot review — unit-test isolation

- Reviewer: OpenAI GPT-6.1 Sol, medium
- Scope: uncommitted `frontend/angular.json` change after archive-head Verify attempts
- Verdict: `APPROVE`
- Findings: no P0–P3

The installed Angular 22.2.1 unit-test builder supports `isolate`. Enabling it only
for the Vitest test target separates spec-file globals, modules, DOM and storage and
addresses the two distinct cross-file authority/focus failures. It does not replace
cleanup between tests in one spec. Runtime and memory impact remain an executable CI
gate rather than a static-review claim.
