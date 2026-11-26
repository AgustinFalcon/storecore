# PCC-011C2 — BlackStore stock contract and explicit exclusions

Date: 2026-11-25

## Scope closed

- The catalog token preserves the existing opaque catalog-query semantics: `MAX(products.updated_at)::text`, with the canonical `empty` value for an empty catalog. Inventory movement does not claim to change it or make it a remote-freshness token.
- Current StoreCore stock is independent of BlackStore module and companion-registration state. It proves the complete active-product/active-variant cohort before applying the deterministic 50-row `variant_id` ascending display limit.
- Every active variant must have a structurally valid balance and valid display text. A missing balance is `Unavailable(SOURCE_MISSING)`; a contradiction anywhere in the full cohort is unavailable rather than hidden outside the visible page.
- Sellable quantity is exactly `max(0, available_quantity - safety_stock)`. Reserved quantity is validated but is not subtracted a second time.
- Totals are lossless `Long`-bounded values. The domain factory uses checked visible summation, exact aggregate equality for complete cohorts, and joint quantity/zero-count bounds for truncated cohorts. It cannot construct an available payload whose hidden positive variants have no units or whose hidden zero variants leave unexplained units.
- Remote freshness is `Unavailable(NO_EVIDENCE)`. BlackStore sales, revenue, payments, returns, monetary channel mix, historical stock and synchronization are `NotAvailable(UNSUPPORTED_CONTRACT)`; no zero is fabricated.
- The read remains inside the report-owned read-only repeatable-read snapshot and invokes no operational service, capability decision, rate limiter, catalog cursor or writer.

PCC-011 authoritative aggregates and bounded BlackStore projection are complete. API/dashboard/CSV, browser validation, hosted CI and merge remain PCC-012/PCC-013 work.

## TDD and validation

The initial red cycle failed only on the intentionally missing C2 types and report fields. The first green exposed a reviewer P2: the aggregate factory could accept a complete visible row with seven units while declaring zero aggregate units and one zero row. A behavior-level domain regression reproduced it before production changed.

The first repair added checked summation, exact complete-cohort equality and truncated lower bounds. Review then found a second joint-invariant P2: one hidden nonzero variant could be declared without any remaining unit. A second red regression reproduced that exact contradiction. The final repair relates hidden zero count, hidden positive count and hidden units, including the inverse case where all hidden variants are zero but units remain unexplained.

Final command:

```text
mvn.cmd -q "-Dtest=StoreCoreCreatedOrderReportPostgresTest,StoreCoreCreatedOrderReportFailureTest,ChannelReportingDomainTest" test
```

Result: exit code 0 after all 39 migrations on PostgreSQL 16 Testcontainers.

- PostgreSQL report tests: 27 passed.
- Transaction failure test: 1 passed.
- Reporting domain tests: 9 passed.
- Total: 37 passed, 0 failures/errors/skips.
- `git diff --check`: passed with only Windows LF/CRLF notices.

## Review evidence

Two GPT-6.1 Sol reviewers independently reviewed architecture/SDD and PostgreSQL consistency. They agreed on both P2 findings, confirmed each red reproduction, and returned **APPROVE** after the joint aggregate invariant repair with no remaining P0-P3. Their approvals are limited to PCC-011C2.
