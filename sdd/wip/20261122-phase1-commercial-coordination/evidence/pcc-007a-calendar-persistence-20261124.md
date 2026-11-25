# PCC-007A — calendar domain and persistence evidence

Date: 2026-11-24

## Delivered boundary

- Added closed calendar lifecycle, operation, outcome, audience, reminder channel, occurrence and switch types plus object-per-transition rules. Unknown wire values fail closed at the boundary.
- Added IANA-zone local-time resolution with explicit offsets, deterministic DST gap/overlap handling and bounded calendar definitions.
- Added revisioned aggregate persistence, immutable definition history, ten-minute preflight snapshots, idempotent command bindings, private receipts and append-only audit records.
- Added durable reminder occurrence identity and a persisted kill switch that defaults to `DISABLED`.
- Enforced current USER authorization again after blocking aggregate/preflight locks and protected occurrence identity from temporary-table shadowing.
- Correlated binding, actor, event, command family, canonical payload, requested definition and applied historical snapshot in both PostgreSQL constraints and the Kotlin decoder.
- PCC-007A intentionally adds no HTTP route, bean, scheduler, timer, email or external transport. Runtime cannot update the reminder switch or reminder occurrences.

## Validation

- Exact implementation head before this evidence commit: `0fea8a2bc66bcf0551f2da29f9907e4cdb21e533`.
- Focused Kotlin/PostgreSQL suites: 17 tests, 0 failures, 0 errors, 0 skipped.
- Full backend suite after production-code fixes: 127 suites, 708 tests, 0 failures, 0 errors, 9 declared skips.
- Flyway clean install and V35-to-V36 upgrade validated against PostgreSQL 16; all 36 migrations validate and prior checksums remain unchanged.
- Regression coverage includes lock-time session expiry, command replay, CAS races, DST boundaries, TEMP shadow attempts, canonical receipt forgery, EDIT request-to-effect mismatch and transactional audit rollback.
- `git diff --check`: PASS. All Testcontainers resources were stopped after validation.

## Independent reviews

Two independent GPT-6.1 Sol reviews covered correctness/architecture and security/data integrity. Review rounds found and drove closure of lock-time authorization, temporary-table shadowing, receipt correlation, canonical payload reconstruction, EDIT request-to-effect binding and test-isolation issues.

Both final reviews examined exact SHA `0fea8a2bc66bcf0551f2da29f9907e4cdb21e533` against master `227412d6426cd488a91dd321c166ef8ea20c95be` and returned `VERDICT: APPROVE` with no P0–P3.
