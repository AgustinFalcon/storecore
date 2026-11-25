# PCC-011B2A — applied accreditation and gross best sellers

Date: 2026-11-25

## Scope closed

- Applied-accreditation count, confirmed gross, merchandise subtotal and shipping amount selected by immutable `PAYMENT_ACCREDITED.applied_at`.
- Exact order/application/attempt/payment/provider/currency/amount authority checks.
- Approved payment authority and proven terminal authority; unresolved duplicate remote credit fails closed.
- A legitimate prior cancelled unpaid attempt does not poison a later accreditation.
- `PAID_WITHOUT_STOCK` remains an operational incident and does not erase proven historical gross.
- Gross best-seller units from immutable order items, bounded to 20 with exact total and deterministic `units DESC, variantId ASC` ordering.
- Historical SKU/name are taken together from the latest admitted immutable item tuple per variant; ordinary renames are allowed.
- Missing/mismatched items, non-text JSON, noncanonical edge text and invalid rows outside the top 20 make only the best-seller projection unavailable.
- All queries run inside the owned PCC-011B1 repeatable-read snapshot.

Payment disposition, inventory, returns, low stock, BlackStore, HTTP/UI/export, hosted CI and merge remain pending.

## TDD and PostgreSQL evidence

Red evidence included missing application values, invalid fixture cross-contamination, and each strict review regression before its correction.

Green command:

```text
mvn.cmd -q "-Dtest=StoreCoreCreatedOrderReportPostgresTest,StoreCoreCreatedOrderReportFailureTest,ChannelReportingDomainTest" test
```

Result: exit code 0 after all 39 Flyway migrations on PostgreSQL 16 Testcontainers.

- `StoreCoreCreatedOrderReportPostgresTest`: 13 passed.
- `StoreCoreCreatedOrderReportFailureTest`: 1 passed.
- `ChannelReportingDomainTest`: 6 passed.
- Total: 20 passed, 0 failures/errors/skips.
- `git diff --check`: passed with only Windows LF/CRLF notices.

Covered regressions include late accreditation, exact merchant boundaries, nullable provider identity, pending contradiction, cancelled retry, rename history, malformed JSON, missing items, item/subtotal coherence, 21-way truncation/tie order, invalid rank-21 text and open stock incident.

## Review evidence

Two GPT-6.1 Sol reviewers independently reviewed and cross-checked the slice. Three review rounds found and repaired:

- nullable SQL authority silently omitted from both valid and invalid counts;
- legitimate cancelled attempts classified as orphan funded payments;
- non-text snapshots coerced into labels;
- normal historical renames treated as corruption;
- missing order items presented as an empty authoritative ranking;
- differing SQL/Kotlin text rules that hid invalid rows below the top 20;
- stock-only incidents incorrectly erasing historical accreditation.

Final architecture review: **APPROVE**, no P0-P3.

Final concurrency review: **APPROVE**, no P0-P3.

Both approvals are limited to PCC-011B2A.
