# PCC-002 — notification persistence evidence

Date: 2026-11-24

## Delivered boundary

- V33 constrained PostgreSQL schema for alert projections, source evidence, command receipts and lifecycle audit.
- Clean install and V32-to-V33 upgrade with published historical checksums preserved.
- Atomic ingestion that separates delivery replay from logical episode convergence.
- Exact historical receipts for applied and authorized rejected lifecycle commands.
- Current ADMIN authorization checked before and after command and aggregate lock waits.
- Strict SQL-to-domain row mapper and receipt snapshot codec; malformed or future receipt data never becomes success.
- Runtime least privileges, immutable evidence and rollback on receipt, audit or source-event failure.

HTTP, CSRF, pagination, optional email delivery and frontend remain PCC-003/PCC-004.

## Validation

- PostgreSQL 16.14 focal: 16 tests, 0 failures, 0 errors, 0 skipped.
- Expanded migration/integration matrix: 90 tests across 17 suites, 0 failures, 0 errors, 0 skipped.
- Both lock-wait regressions expire the session while blocked and prove no effect or receipt is committed.
- `git diff --check`: PASS.
- Independent correctness review: APPROVE, no open P0-P3.
- Independent security review: APPROVE, no open P0-P3.
