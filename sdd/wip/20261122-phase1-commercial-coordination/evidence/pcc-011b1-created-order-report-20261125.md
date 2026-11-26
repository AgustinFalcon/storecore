# PCC-011B1 — canonical created-order reporting aggregate

Date: 2026-11-25

## Scope closed

- Canonical merchant-date request validation and exact `[fromInclusive,toExclusive)` instants.
- StoreCore created-order count and nominal ARS total sourced only from `orders.created_at`.
- One owned `REQUIRES_NEW`, read-only, PostgreSQL `REPEATABLE READ` snapshot.
- Runtime verification of the effective transaction isolation/read-only contract.
- Closed read results for invalid periods, unavailable timezone, contradictory source data and read failure.
- `SourceUnavailable` can only be created with an `UNAVAILABLE` reason; invalid reasons cannot bypass the invariant through `copy`.

This slice does not claim payment accreditation, disposition, best sellers, inventory, returns, low-stock, BlackStore projection, API/UI/export, hosted CI or merge. Those remain in PCC-011B2 onward.

## TDD evidence

Red cycles observed:

- unresolved application/repository/result types before implementation;
- fixture rejected by the real canonical customer constraint;
- regression tests failed to compile before the closed `SourceUnavailable.create` boundary existed.

Green command:

```text
mvn.cmd -q "-Dtest=StoreCoreCreatedOrderReportPostgresTest,StoreCoreCreatedOrderReportFailureTest,ChannelReportingDomainTest" test
```

Result: exit code 0.

- `StoreCoreCreatedOrderReportPostgresTest`: 3 tests, 0 failures/errors/skips.
- `StoreCoreCreatedOrderReportFailureTest`: 1 test, 0 failures/errors/skips.
- `ChannelReportingDomainTest`: 6 tests, 0 failures/errors/skips.
- PostgreSQL 16 Testcontainers applied all 39 Flyway migrations.
- `git diff --check`: passed; only the existing Windows LF/CRLF conversion notices were emitted.

## Review evidence

Two GPT-6.1 Sol reviewers worked independently and compared conclusions.

Initial result: NO-GO with three P2 findings:

1. default `REQUIRED` could join a weaker writable transaction;
2. transaction begin/commit failures could escape the closed result;
3. public `SourceUnavailable` admitted incompatible reasons.

Corrections:

- own `REQUIRES_NEW` boundary plus in-database isolation/read-only assertion and an outer `READ_COMMITTED` regression;
- translation of `TransactionException` and a failing-connection regression;
- private non-data result with a validating factory.

Final architecture review: **APPROVE**, no P0-P3.

Final concurrency review: **APPROVE**, no P0-P3.

Both approvals are explicitly limited to PCC-011B1.
