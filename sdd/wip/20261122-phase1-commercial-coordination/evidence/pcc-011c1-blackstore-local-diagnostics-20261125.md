# PCC-011C1 — BlackStore local diagnostics

Date: 2026-11-25

## Scope closed

- Module configuration, companion registration and retained-operation evidence are independent current-snapshot values.
- Closed registration states distinguish absent, disabled, active and revoked-only registration while retaining a lossless revoked-history count.
- The unbounded revoked history is reduced in PostgreSQL with bigint counts and contradiction flags; it is never materialized or counted through an `Int` collection.
- Retained operations expose separate closed counts for `PENDING`, `RESERVED`, `COMMITTED`, `RELEASED` and `EXPIRED`.
- Tombstones expose separate counts for terminal `COMMITTED`, `RELEASED` and `EXPIRED`; they are not reconstructed as sales or complete history.
- Latest retained update and latest retirement are separate local activity values. Their absence is `Unavailable(NO_EVIDENCE)` and neither is called remote heartbeat or synchronization.
- A tombstone without a current companion is valid. The same full operation identity present in live detail and tombstone is contradictory.
- Reads share the report-owned read-only repeatable-read snapshot and call no capability decision, operational service, rate limiter or cursor-writing catalog adapter.

Opaque token, current StoreCore stock proof, remote/commercial exclusions, API/UI/CSV, hosted CI and merge remain pending.

## TDD and validation

The red cycle failed on the intentionally missing closed BlackStore reporting types and accessors. The first green received two P2 findings: unbounded revoked history materialization with an intermediate `Int` count, and semantically contradictory registration states constructible in the factory. Both became direct implementation/domain corrections.

Green command:

```text
mvn.cmd -q "-Dtest=StoreCoreCreatedOrderReportPostgresTest,StoreCoreCreatedOrderReportFailureTest,ChannelReportingDomainTest" test
```

Result: exit code 0 after all 39 migrations on PostgreSQL 16 Testcontainers.

- PostgreSQL report tests: 26 passed.
- Transaction failure test: 1 passed.
- Reporting domain tests: 8 passed.
- Total: 35 passed, 0 failures/errors/skips.
- `git diff --check`: passed with only Windows LF/CRLF notices.

## Review evidence

Two GPT-6.1 Sol reviewers approved the contract before implementation, issued the same two P2 findings on the first green, then independently returned **APPROVE** after repair with no new P0-P3. Both approvals are limited to PCC-011C1.
