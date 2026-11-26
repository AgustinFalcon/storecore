# PCC-012B CSV contract review — 2026-11-25

The reviewed contract freezes a 50-column rectangular CSV, five closed record kinds, 24 closed root metric names, closed operation parts, exhaustive metric-to-record mapping, deterministic detail ordering and cell-type-specific escaping. Header and the single metadata record are outside the 50,000 data-record bound; every status, value, item and group is inside it.

Each section plan owns both its count and emission. The exact pre-count uses unbounded arithmetic and must equal the prepared logical record count. Export lists are complete, use `truncated=false`, and never pass through dashboard-limited factories. Unsupported/unavailable metrics emit only truthful status rows.

The preparation port and transaction contract are also frozen: closed results, one fresh read-only repeatable-read snapshot, early period-token comparison, pre-count before detail reads, complete preparation before commit/HTTP headers, authentication outside the snapshot and transport without late queries or decisions.

Two GPT-6.1 Sol reviewers independently verified the applied header has exactly 50 columns and the mapping/snapshot contract is exhaustive and implementable. Both returned **APPROVE** with no P0-P3. This evidence authorizes PCC-012B implementation only; it claims no exporter code, route, hosted CI or merge yet.

## Primitive implementation checkpoint

The first reversible PCC-012B implementation unit adds the closed 50-column, five-record-kind, 24-metric and five-part vocabularies, canonical numeric/money cells, formula-protected open text, rectangular records and deterministic RFC 4180 encoding with CRLF endings.

The initial red compile failed only on the intentionally missing CSV symbols. The first green review found a P2 bypass through a public raw canonical-cell factory and a P3 self-derived header assertion. Both were corrected at the cause: cell construction is private with typed factories only, and the test now owns an independent 50-column golden header. Both GPT-6.1 Sol reviewers then returned **APPROVE** with no P0-P3.

Evidence executed locally:

- `mvn.cmd -q -Dtest=ChannelReportCsvTest test` — 4 tests, 0 failures, 0 errors.
- `mvn.cmd -q -Dtest='ChannelReportCsvTest,ChannelReportingDomainTest,ChannelReportHttpContractTest,ChannelReportControllerTest,StoreCoreCreatedOrderReportFailureTest' test` — 21 tests, 0 failures, 0 errors.
- `git diff --check` — no whitespace errors at this checkpoint.

PCC-012B remains `in_progress`: snapshot preparation, exact pre-count, full-detail emission, the 50,000/50,001 boundary, transport mapping and cleanup are deliberately not claimed by this checkpoint.

## Preparation boundary checkpoint

The next reversible unit adds the exact three-parameter CSV query, canonical period-token translation, the separate preparation port with the five closed outcomes, and an owned prepared artifact. The artifact contains no JDBC, lazy callback or HTTP object; it copies both incoming and outgoing bytes, synchronizes read/release, clears its owned buffer and releases idempotently.

The red compile named only the missing query and artifact symbols. `mvn.cmd -q -Dtest='ChannelReportCsvPreparationTest,ChannelReportHttpContractTest' test` then passed 6 tests with 0 failures and 0 errors. Architecture and concurrency reviewers both returned **APPROVE** with no P0-P3. Commit-before-`Prepared` remains an adapter obligation for the next checkpoint and is not claimed here.

## Exact record-budget checkpoint

The record-budget primitive sums section counts with unbounded `BigInteger`, rejects negative inputs, admits exactly 50,000, rejects 50,001 and verifies exact equality with the eventual prepared data-record count. The focused suite passed 2 tests with 0 failures/errors, including `Long.MAX_VALUE + 1` without bounded overflow. Both reviewers returned **APPROVE** and reiterated that the integrated section plan must own both count and emission before `Prepared` is published.

## Owned-snapshot seam checkpoint

The existing JDBC report adapter now has one private `executeOwnedSnapshot` owner and a separate `readWithinSnapshot` projection. Public `read()` still validates before database work, opens the same `REQUIRES_NEW` read-only repeatable-read transaction, verifies PostgreSQL settings and translates begin/read/commit failures to the closed unavailable result. Future export can call the within-snapshot work directly rather than nesting public `read()`.

`mvn.cmd -q -Dtest='StoreCoreCreatedOrderReportFailureTest,StoreCoreCreatedOrderReportPostgresTest' test` passed 29 tests with 0 failures/errors against a fresh PostgreSQL 16 Testcontainer and all 39 migrations. Both reviewers returned **APPROVE** with no P0-P3. No export behavior is claimed by this refactor-only checkpoint.

Period resolution is now also separated from metric projection while remaining inside that owned snapshot. The order remains timezone → database clock → canonical period; only after a successful resolution can a caller project metrics. The same 29-test PostgreSQL/failure suite remained green, and both reviewers returned **APPROVE**. This creates the required seam for a stale-token comparison before metric queries; the comparison itself remains the next implementation cut.

## Section-plan checkpoint

The first executable section plan owns both count and emission for the minimal valid fixture: one metadata record outside the budget, 24 root status records and the available `createdOrders` value. It repeats authoritative context, emits typed canonical count/money cells and verifies the prepared record count against the same records before encoding.

The first review found a P2 because the draft branched on HTTP availability strings. The plan was corrected to consume sealed `ReportValue<T>`, typed evidence and `ReportPeriod` directly; the HTTP mapper is invoked only as an integral correlation validator and its DTO is discarded. The affected CSV/HTTP suite passed 12 tests with 0 failures/errors, and both reviewers returned **APPROVE** with no remaining P0-P3. Other available metrics deliberately fail plan creation until their own section implementations land; this partial plan is not wired to the preparation port or HTTP.

The same typed plan now implements every non-large available section: applied accreditation values, the six payment buckets, sorted inventory groups or explicit empty value, return receipt/disposition values, module/registration/catalog values and eight operation groups plus two nested activity statuses and their optional values. A P3 review found that the initial test counted rows without proving order or column mapping; the fixture and oracle now use asymmetric amounts, reversed inventory input and exact column assertions for payment order, inventory order, retained/retired order and nested evidence/`NO_EVIDENCE`. The clean affected suite passed 13 tests with 0 failures/errors; both reviewers returned **APPROVE**. The full collection sections remain deliberately unavailable until deferred detail loading is implemented.

## Deferred complete-collection checkpoint

Best sellers, low stock and current BlackStore stock now contribute their exact totals to section counts without requiring complete details. Admission is checked before any section emitter runs. An admitted caller supplies separate complete typed collections; emission validates exact size, identity uniqueness, contract order, aggregate equations and a field-by-field prefix match against the bounded sample already validated in the report. This prevents a complete list from contradicting facts observed during summary projection. Formula protection remains on every open-text item cell.

The first review found the missing prefix correlation (P2) and insufficient item-column evidence (P3). Regressions now reject a same-size/same-order payload contradiction, export 55 rows for each collection beyond the 20/50 dashboard bounds, assert exact ITEM and summary columns, successfully encode exactly 50,000 data records and reject 50,001 before emission. The clean affected suite passed 17 tests with 0 failures/errors; the final focused 8-test collection suite also passed. Both reviewers returned **APPROVE** with no P0-P3.

## JDBC preparation and transaction checkpoint

The JDBC adapter now implements the preparation port through the same owned `REQUIRES_NEW`, read-only, repeatable-read snapshot as the report projection. It resolves the canonical period, rejects a stale typed token before metric projection, computes the complete record budget before detail reads, and selects dashboard versus complete collection queries through the closed `ReportCollectionMode`. Each collection has one shared query and mapper; only the closed mode owns the SQL limit.

For an admitted request, complete best-seller, low-stock and current-stock collections are loaded and encoded inside the snapshot. A provisional owned artifact is created before commit but cannot become the public `Prepared` result until `TransactionTemplate.execute` returns. Any begin, read, pre-commit or ambiguous post-delegate commit failure returns the closed unavailable result and idempotently clears/releases provisional bytes.

Evidence executed locally against PostgreSQL 16 and all 39 migrations:

- `ChannelReportCsvPreparationTest` — 8 tests, 0 failures, 0 errors.
- `StoreCoreCreatedOrderReportFailureTest` — 2 tests, 0 failures, 0 errors.
- `StoreCoreCreatedOrderReportPostgresTest` — 34 tests, 0 failures, 0 errors, including stale-before-metrics, a real latch between admission and detail reads, weaker outer transaction ownership, and commit failure before/after the physical delegate with artifact cleanup.
- `ChannelReportCsvRepositoryLimitPostgresTest` — isolated database, 1 test, 0 failures, 0 errors. The fixture derives the fixed contract baseline, bulk-creates exactly 50,000 data records and receives a complete `Prepared`; one additional current-stock record yields 50,001 and returns `TooLarge` before `DETAIL_COLLECTION` with zero artifacts created.
- Combined focal gate — 45 tests, 0 failures, 0 errors.
- `git diff --check` — no whitespace errors.

The architecture and concurrency reviewers independently returned **APPROVE** with no P0-P3 after inspecting the final diff and Surefire evidence. PCC-012B remains `in_progress`: the authenticated HTTP streaming adapter, response mapping and disconnect cleanup are not claimed by this checkpoint.
