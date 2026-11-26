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
