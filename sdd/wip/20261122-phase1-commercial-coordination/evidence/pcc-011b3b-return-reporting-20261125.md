# PCC-011B3B — operational returns and confirmed disposition

Date: 2026-11-25

## Scope closed

- Operational return receipts select `returns.received_at` in the canonical merchant `[from,to)` period and expose return count plus returned units.
- Receipt quantities remain deliberately re-readable before confirmed disposition. A restatement changes a later report rather than pretending the earlier value was immutable history.
- Receipt authority validates the return state and chronology, at least one unique related order item, positive bounded quantities and exact return-to-order/item-to-order relationships.
- A received-like state without `received_at` cannot disappear from an arbitrary period as available zero; it closes the receipt metric unavailable because no period can be assigned authoritatively.
- Confirmed unit disposition selects only immutable `rma_disposition_commands.confirmed_at` in the period and exposes confirmed-return count plus restock, damaged and rejected unit partitions.
- Confirmed authority independently proves receipt-before-confirmation chronology, complete exact order-item coverage, exact sold quantities, item partitions and matching immutable `RMA_RESTOCK/INTERNAL` ledger bindings.
- Receipt and confirmed disposition use separate evidence descriptors and time bases inside the same report-owned repeatable-read snapshot.
- Net revenue, monetary reversals and fiscal totals are explicit `NotAvailable(REVERSAL_AMOUNT_UNAVAILABLE)` values. Physical receipt, mutable status and legacy inspection never prove money.

PCC-011B StoreCore aggregates are complete. BlackStore projection, API/UI/CSV, hosted CI and merge remain pending.

## TDD and validation

The red cycle was recorded with unresolved return-report symbols before production implementation. The first green implementation received three P2 findings, each then pinned as a PostgreSQL regression:

1. confirmed rows could exceed sold quantity or omit order items;
2. a received-like row with null `received_at` could disappear as available zero;
3. confirmed disposition could admit `received_at < created_at`.

Green command:

```text
mvn.cmd -q "-Dtest=StoreCoreCreatedOrderReportPostgresTest,StoreCoreCreatedOrderReportFailureTest,ChannelReportingDomainTest" test
```

Result: exit code 0 after all 39 migrations on PostgreSQL 16 Testcontainers.

- PostgreSQL report tests: 25 passed.
- Transaction failure test: 1 passed.
- Reporting domain tests: 7 passed.
- Total: 33 passed, 0 failures/errors/skips.
- `git diff --check`: passed with only Windows LF/CRLF notices.

## Review evidence

Two GPT-6.1 Sol reviewers independently issued the initial NO-GO and reviewed the repaired implementation again:

- architecture review: **APPROVE**, all three P2 closed and no new P0-P3;
- concurrency review: **APPROVE**, snapshot, independent periods, restatement and per-metric fail-closed behavior accepted.

Both approvals are limited to PCC-011B3B. PCC-011 remains in progress until PCC-011C is complete.
