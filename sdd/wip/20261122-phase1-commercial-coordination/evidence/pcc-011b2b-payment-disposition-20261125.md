# PCC-011B2B — current payment disposition

Date: 2026-11-25

## Scope closed

- Closed current payment dispositions: `PENDING`, `APPROVED`, `REJECTED`, `CANCELLED`, `REFUNDED`, `CHARGED_BACK`; `UNKNOWN` is translation-only and never becomes a bucket.
- The cohort is selected only by `orders.created_at` inside the canonical merchant `[from,to)` limits.
- Classification matches the existing strict order projection: exact accredited identity/amount/currency, orphan funded payment detection, current incident policy and reversal evidence.
- A contradiction anywhere makes the complete disposition value unavailable; it is never counted as zero or `UNKNOWN`.
- Pending/rejected credited rows cannot be promoted by reversal evidence.
- Terminal current payment remains classified even when the order projection itself would become unknown.
- Gross historical accreditation and current disposition remain deliberately separate: `PAID_WITHOUT_STOCK` preserves B2A gross but makes B2B current disposition unavailable, matching the contracted classifier.
- All reads share the report's owned repeatable-read snapshot.

Inventory, returns, low stock, BlackStore, API/UI/export, hosted CI and merge remain pending.

## TDD and validation

The red cycle failed on missing closed disposition types and report values. Initial implementation then received a strict NO-GO for classifier drift. The corrected implementation added parity regressions for terminal payments, open stock incidents and pending credit plus resolved reversal.

Green command:

```text
mvn.cmd -q "-Dtest=StoreCoreCreatedOrderReportPostgresTest,StoreCoreCreatedOrderReportFailureTest,ChannelReportingDomainTest" test
```

Result: exit code 0 after all 39 migrations on PostgreSQL 16 Testcontainers.

- PostgreSQL report tests: 17 passed.
- Transaction failure test: 1 passed.
- Reporting domain tests: 6 passed.
- Total: 24 passed, 0 failures/errors/skips.
- `git diff --check`: passed with only Windows LF/CRLF notices.

## Review evidence

Two GPT-6.1 Sol reviewers independently found three P2 classifier drifts:

1. pending/rejected credits were admitted and could be promoted to refunded;
2. a terminal payment was erased when only the projected order should become unknown;
3. stock incidents were treated differently from the contracted current-state classifier.

After repair and parity tests:

- architecture review: **APPROVE**, no P0-P3;
- concurrency review: **APPROVE**, no P0-P3.

Both approvals are limited to PCC-011B2B.
