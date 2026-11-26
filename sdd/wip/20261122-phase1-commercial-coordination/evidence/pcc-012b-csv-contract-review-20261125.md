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
