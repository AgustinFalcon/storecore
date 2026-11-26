# PCC-015A pure loyalty domain implementation — 2026-11-26

## Status

PCC-015A is `in_progress`. This record proves local test-first implementation only; it does not claim hosted CI, exact-head approvals, merge or task completion. PCC-015B through PCC-015F remain pending. No migration, Spring/JDBC/HTTP adapter, scheduled job, provider activation or production correction source is added by this cut.

## Observable boundary

The cut implements framework-independent Kotlin domain objects for:

- exact `POINT`, ARS minor-unit and revision values plus closed wire vocabularies with non-actionable `UNKNOWN`;
- Policy V1 quote/earning arithmetic, proportional cent allocation and an exact typed eligibility snapshot;
- 15-minute reservation windows and closed step objects for legal transitions;
- conserved 365-day lots, expiry, FIFO reserve, commit, release and original-expiry restoration;
- cumulative earning-correction progress that keeps prior free reversal, expired coverage and recovery distinct and applies a checked target delta all-or-nothing.

Persistence, authorization, receipts, concurrency locks, checkout binding, accreditation projection, durable corrections and recovery `RECHECK` belong to the later ordered cuts.

## TDD evidence

### Initial RED and first GREEN

The first 17 behavior tests were introduced before their production types. The focused Maven run failed during test compilation because the loyalty domain types did not exist. After the smallest implementation, the same command passed 17 tests. A JVM initialization cycle in the sealed reservation-step singleton list was reproduced as 16/17 and fixed at its cause by making the canonical list a getter; no assertion was relaxed.

```powershell
mvn -B '-Dtest=LoyaltyPolicyTest,LoyaltyReservationTest,LoyaltyLotsTest' test
```

Result after that fix: `BUILD SUCCESS`; 17 tests, 0 failures, 0 errors, 0 skipped.

### Strict provisional review and second RED

Two independent GPT-6.1 Sol medium reviewers returned `REQUEST_CHANGES`. They agreed that the first implementation:

1. reused prior `reversed`/`expired` coverage across successive correction deltas;
2. admitted a reservation when summed free points exceeded signed `Long`;
3. accepted an arbitrary reservation expiry instead of owning the exact 15-minute lifetime;
4. lacked the typed eligibility snapshot promised by PCC-015A.

Tests were added first for partial-to-full cumulative correction, expired coverage followed by a held target, wallet `Long.MAX_VALUE + 1`, domain-owned TTL and eligibility/tax/policy arithmetic. The focused command failed during test compilation on the deliberately absent new APIs. This was the expected second RED, not an environment failure.

### Corrected GREEN

The production change then added only those missing domain behaviors and repeated the identical focused command.

Result: `BUILD SUCCESS` in 2:58; 21 tests, 0 failures, 0 errors, 0 skipped.

### Further provisional review rounds

The reviewers then found four additional P2 cases rather than approving prematurely: tax was being excluded twice; known ineligible items could not retain zero-benefit snapshots; points already reversed by another admitted effect were not available as no-debt correction coverage; and aggregate partition overflow was checked only for available points rather than before and after every lot mutation. New tests again failed first on the absent corrected APIs.

The final local implementation keeps tax as separate evidence without subtracting it again, retains `OUTLET|GIFT_VALUE|LOYALTY_VALUE` snapshots with zero eligible benefit while rejecting `UNKNOWN`, records distinct prior reversed coverage, and validates every aggregate lot partition before and after expiry/reserve/commit/release. The identical focused command then passed:

Result: `BUILD SUCCESS` in 2:58; 22 tests, 0 failures, 0 errors, 0 skipped:

- `LoyaltyPolicyTest`: 8;
- `LoyaltyReservationTest`: 4;
- `LoyaltyLotsTest`: 10.

Repository-preexisting Kotlin warnings were emitted outside the new loyalty package; no loyalty compilation warning or test failure remained.

## Residual gates

- Re-review the corrected uncommitted delta, then commit it as one bounded cut.
- Integrate the independently merged PCC-014 closeout from PR #422.
- Run affected/full backend and repository hygiene gates.
- Obtain two independent exact-head GPT-6.1 Sol medium approvals, commit their receipts, recheck the receipts-only head and pass hosted CI before merge.
- Mark PCC-015A complete only in post-merge evidence. Do not begin PCC-015B on an unmerged A base.
