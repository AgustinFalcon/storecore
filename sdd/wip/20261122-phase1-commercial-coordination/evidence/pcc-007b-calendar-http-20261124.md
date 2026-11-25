# PCC-007B — calendar application and USER HTTP evidence

Date: 2026-11-24

## Delivered boundary

- Added application services and a single strict HTTP translator for USER calendar reads, ADMIN commands, preflight, private receipt recovery and append-only audit reads.
- Added bounded overlap queries with stable ordering and pagination, live USER-session authorization before and after database reads, and ADMIN-only audit/switch diagnostics.
- Added exact 32 KiB JSON bodies, canonical identifiers and revisions, closed finite wire types, fail-closed future/corrupt-state handling, same-origin JSON, CSRF rotation and `Cache-Control: no-store`.
- Preserved immutable replay receipts and explicit EDIT definition revisions without deriving them from aggregate state.
- Exposed only the ADMIN diagnostic reminder-switch read with closed readiness `UNAVAILABLE`. PCC-007B adds no switch-command mapping, UPDATE privilege, runner, timer, email or external transport.
- Accepted semantically valid ISO instants emitted by browser `Date.toISOString()`, including `.000Z`, while retaining semantic range and overlap bounds.

## Validation

- Exact implementation head before this evidence commit: `3ca3a39cde5f1c431a4aaeba4cda832378f5c691`.
- Focused calendar domain, translator, HTTP/PostgreSQL and persistence suites: 29 tests, 0 failures, 0 errors, 0 skipped.
- Browser-ISO regression suite: 5 tests, 0 failures, 0 errors, 0 skipped.
- Final clean full backend suite: 129 suites, 720 tests, 0 failures, 0 errors, 9 declared skips.
- An earlier full-suite attempt hit one unrelated migration-test error after an interrupted prior run. The test passed 6/6 in isolation and the complete clean rerun passed; no production change was made to hide it.
- Regression coverage includes USER/CUSTOMER separation, current role/session checks, CSRF/origin/media enforcement, replay and lost-response recovery, private 404 indistinguishability, strict overlap/nanosecond boundaries, paginated audit, corrupt data rollback, runtime-role SQL reads and lock-time expiry.
- `git diff --check`: PASS. All Testcontainers resources were stopped after validation.

## Independent reviews

Two independent GPT-6.1 Sol reviewers covered correctness/architecture and security/authorization on exact SHA `200c7218dff0a4bd79c2549b3c815f69bf994de5`. Both identified the same P2 browser-ISO compatibility issue and no other P0–P3.

After the fix, both reviewers re-examined the complete diff from master `4b0e06ab3d6f73ed7d038aa587a9687bef2e10d8` through exact SHA `3ca3a39cde5f1c431a4aaeba4cda832378f5c691`, shared their conclusions and returned `VERDICT: APPROVE` with no P0–P3.
