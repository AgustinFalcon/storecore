# PCC-011A reporting domain evidence — 2026-11-25

## Scope

This cut implements only the framework-free reporting domain and canonical period hash. It creates no route, SQL query, Spring bean, migration, frontend claim or BlackStore activation.

## Test-first implementation

The first focal compile failed because the reporting domain did not exist. The smallest implementation added closed availability/source/time-basis/freshness/reason types, sealed available/unavailable/not-available values, lossless unsigned and signed Long wires, canonical ARS amounts, exact merchant periods and a length-framed SHA-256 period token.

A second RED proved the production hasher was absent. Its adapter now frames the field count plus every UTF-8 byte length before hashing, so concatenation and Unicode boundaries cannot collide structurally.

## Review defects and repairs

Two independent GPT-6.1 Sol reviewers returned `NO-GO` on four P2 defects: report money inherited the per-order `NUMERIC(14,2)` cap; fixed-offset zones passed `ZoneId.of`; data-class constructors/copy could bypass `ReportValue` factories and admit null/unknown; and period evidence did not carry the exact period.

The repair removes the per-order aggregate cap while retaining exact scale-two/no-rounding rules, normalizes internal BigDecimal values exactly, requires a tzdb identifier plus a unique midnight offset, replaces data classes with private non-null closed constructors, makes every reason own its allowed availability, separates current-snapshot from period evidence and derives period `observedAt` directly from the period. Tests cover aggregate money, ZERO/ONE normalization, fractional-cent rejection, 366/367-day limits, DST gap/overlap, fixed-offset rejection and evidence/time-basis compatibility.

Both reviewers then returned `APPROVE` with no remaining P0–P3 findings.

## Verification

- Initial domain RED: unresolved closed types and period objects.
- Hasher RED: unresolved production period hasher.
- Invariant RED: incompatible reason and aggregate-money assertions failed against the first implementation.
- Final `ChannelReportingDomainTest`: 6 tests, 0 failures, 0 errors, 0 skipped.
- `git diff --check`: required before commit.

## Remaining boundary

PCC-011B StoreCore aggregates, PCC-011C BlackStore stock/status, PCC-012 frontend/CSV and PCC-013 browser/CI/merge remain pending. GitHub authentication is not currently valid, so no hosted result is claimed.
