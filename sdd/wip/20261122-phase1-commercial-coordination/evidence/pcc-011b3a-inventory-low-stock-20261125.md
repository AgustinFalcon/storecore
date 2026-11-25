# PCC-011B3A — inventory movements and current low stock

Date: 2026-11-25

## Scope closed

- Period inventory movements are grouped without mixing event semantics by the closed schema vocabulary: `RESERVATION`, `RELEASE`, `SALE`, `REFUND`, `RETURN_RECEIVED`, `ADJUSTMENT`, `RECONCILIATION`, `STOCK_COMMIT_EXTERNAL` and `RMA_RESTOCK`.
- Event/channel pairings are enforced in the domain type; unknown or schema-illegal pairs make the aggregate unavailable rather than creating a synthetic bucket.
- Signed movement quantities are summed as PostgreSQL `numeric` and converted exactly to signed `Long`, so database `bigint` overflow cannot precede the lossless boundary check.
- Movement time uses the canonical merchant `[from,to)` period and every read shares the report-owned read-only repeatable-read snapshot.
- Current low stock includes only active variants of active products whose `available_quantity <= safety_stock`.
- Every active sellable variant must have an inventory balance; a missing balance makes the value unavailable instead of zero.
- Text validity is checked over the complete low-stock cohort before the bounded projection. An invalid row outside the first 50 still fails closed.
- The projection is limited to 50 and ordered by available quantity then durable variant identity. It exposes the exact total and an explicit truncation flag.

Returns, return disposition/restatement, BlackStore projection, API/UI/CSV, hosted CI and merge remain pending.

## TDD and validation

The first green implementation received four P2 findings: incomplete migration vocabulary, validation only after top-50 truncation, possible PostgreSQL aggregate overflow and a mutable-SKU tie-breaker. Each finding was converted into a behavior regression before final approval.

Green command:

```text
mvn.cmd -q "-Dtest=StoreCoreCreatedOrderReportPostgresTest,StoreCoreCreatedOrderReportFailureTest,ChannelReportingDomainTest" test
```

Result: exit code 0 after all 39 migrations on PostgreSQL 16 Testcontainers.

- PostgreSQL report tests: 20 passed.
- Transaction failure test: 1 passed.
- Reporting domain tests: 7 passed.
- Total: 28 passed, 0 failures/errors/skips.
- `git diff --check`: passed with only Windows LF/CRLF notices.

Regression evidence includes both later schema events/channels, a 51-row tied cohort with an invalid tail row, durable identity order and domain rejection of an illegal `RMA_RESTOCK/WEB` pair.

## Review evidence

Two GPT-6.1 Sol reviewers independently issued the initial NO-GO and then re-reviewed the corrected diff:

- architecture review: **APPROVE**, all four P2 closed and no new P0-P3;
- concurrency review: **APPROVE**, snapshot, boundaries, limits and fail-closed behavior accepted with no new P0-P3.

Both approvals are limited to PCC-011B3A. PCC-011B3 remains in progress until PCC-011B3B is complete.
