# PCC-015C loyalty reservation implementation — 2026-11-27

## Status and exact boundary

PCC-015C is `in_progress`. PCC-015B implementation and hosted closeout are merged. This record starts the test-first reservation cut and claims no implementation, test, review, CI, merge or completion until results are appended below.

This cut may add a durable reservation aggregate, immutable ordered lot allocations, transition history, typed command receipts and bounded explicit quote/cancel/expiry application work. It does not add checkout/order/payment binding, accreditation, correction/recovery persistence, HTTP, UI, a timer/scheduler, a production Spring bean or provider activation; those remain PCC-015D through PCC-015F and PCC-016.

## Design decisions before RED

- V41 is published and remains immutable. V42 is the first candidate forward migration after confirming it is unused on merged `master` `771c55b0ab7b65fc2367f7da0e39af02455ee919`.
- Existing pure `LoyaltyReservationWindow`, closed `LoyaltyReservationState`/`LoyaltyReservationStep` and FIFO `LoyaltyLotAllocator` rules are reused. Persistence receives a new reservation aggregate and one strict boundary translator; views, stores and tests do not compare state strings.
- A hold/release is not a loyalty ledger movement. Reservation definitions, frozen ordered allocations and transition history are distinct evidence. V42 must explicitly replace the V41 B-only deferred lot closure that requires `held=0`; it must not weaken issuance, reversal, expiry or partition conservation.
- Runtime receives no generic reservation DML. Any executable path is a narrow reviewed writer with fixed search path, derived effects, current authority revalidation and exact grants. `LOYALTY` remains `future_optional`/`DISABLED`; no route or automatic invocation is activated.
- Wallet-only commands lock wallet first and sorted lots next. Command claim/replay is resolved under the same transaction. A fresh whole-second instant is read after every blocking lock wait; PostgreSQL transaction-start time is not TTL authority.
- Customer cancellation is valid for an unbound `QUOTED` reservation even at or after its TTL. Cancellation and explicit expiry serialize; the first transition wins and the later distinct command records `INVALID_STATE`. Expiry uses exact `now >= expiresAt`.
- Replay revalidates current authority and returns immutable historical evidence without reapplying expiry or allocations. UUID reuse across realm, actor, operation, aggregate or request hash conflicts.
- Due free-lot expiry materialized while quoting remains separately evidenced as the existing SYSTEM expiry command/effect, even when the customer quote is rejected. A rejected quote cannot hide unrelated expiry mutation inside equal before/after receipt semantics.

## Planned RED/GREEN matrix

1. Closed reservation aggregate and persistence translator reject unknown state, corrupt UUID/revision/time/policy, foreign wallet/actor and inconsistent allocation totals as one unavailable aggregate.
2. Clean PostgreSQL 16, V40-to-latest and V41-to-latest upgrades preserve all published checksums/data, keep LOYALTY disabled and deliver V42 only.
3. V42 rejects mutable definitions/history, unknown states, noncanonical instants, empty/duplicate/out-of-order allocations, cross-wallet/cross-lot evidence, allocation/points mismatch, invalid state history and partitions not equal to immutable evidence.
4. Runtime cannot directly insert, update, delete or truncate reservation evidence or protected partitions; PUBLIC has no executable writer.
5. Successful quote atomically materializes due free expiry, selects FIFO lots, creates one `QUOTED` hold with exact 15-minute expiry, increments revisions and records receipt/audit.
6. Two concurrent 600-point quotes against 1,000 available serialize to one `APPLIED` and one `INSUFFICIENT_BALANCE`; no over-allocation or partial evidence remains.
7. Cancel versus explicit expiry, TTL crossing during a lock wait and exact boundary behavior use a fresh post-lock instant and converge to one terminal transition.
8. Exact replay after later expiry returns the original receipt; foreign actor/realm and UUID conflicts fail closed; whole-transaction failures roll back reservation, allocations, partition, receipt and audit together.
9. Focused domain/application/schema/adapter tests run first, followed by affected integration suites, repository hygiene, two independent exact-head GPT-6.1 Sol medium reviews and hosted CI.

## Evidence log

- Pre-implementation Kotlin/application and PostgreSQL/concurrency audits independently inspected the approved SDD, pure domain, V41, JDBC adapter and current tests, then reconciled the decisions and RED matrix recorded above.
- Kotlin aggregate/translator RED: the test-only `LoyaltyReservationTranslatorTest` reached test compilation and failed on the absent persisted reservation/allocation rows, translator, typed read and unavailable reason. The first shared build also showed unrelated catalog test symbols missing after overlapping Maven processes raced on `backend/target`; that noise was not represented as a product failure. Duplicate builds were stopped and the generated target was rebuilt once with `clean`.
- Kotlin aggregate/translator GREEN: `mvn -B -f backend/pom.xml clean "-Dtest=LoyaltyReservationTranslatorTest" test` passed 10 tests with zero failures, errors or skips (`BUILD SUCCESS`). The delivered first slice is unbound-only: canonical nonzero UUID/identities/revisions, exact Policy V1 and 900-second whole-second window, closed `QUOTED|RELEASED|EXPIRED` admission, positive contiguous ordered unique allocations, exact numeric-wide allocation sum and immutable exposed collections. Known future binding states and every malformed/cross-owner value fail the complete aggregate unavailable.
- V42 structural RED: `LoyaltyReservationMigrationTest` expected latest V42 and observed V41 (1 test, 1 expected failure, 0 errors) before the migration existed.
- V42 structural GREEN adds immutable reservation definitions, ordered allocations and history plus the protected C-only state/revision projection. Deferred closure requires exact allocation sum and ordinals, wallet/lot ownership, history/projection agreement and lot partitions whose held units equal live `QUOTED` allocations. Expiry/reversal remain derived from V41 ledger evidence and redeemed remains zero. Runtime retains SELECT-only access; no new executable writer exists.
- A strict post-GREEN review found that a fabricated reservation could transition terminal inside one owner transaction with one historical allocation larger than the lot issuance while ending with `held=0`. A new test first failed because no `SQLException` was thrown. V42 now rejects every allocation whose points exceed the immutable lot issuance, independent of current state; the focused C suite returned 1/1 green.
- Final combined `LoyaltyPersistenceMigrationTest,LoyaltyReservationMigrationTest` passed 5/5 with zero failures, errors or skips. The B suite remains explicitly pinned to target V41 and proves its original V40-to-V41 history/checksums and B-only closures; the C suite proves clean latest and populated V41-to-V42 upgrade. V41 SQL is unchanged and `git diff --check` passes.
- Latest-schema assertions in affected existing suites were advanced from V41 to V42; historical target-V41 assertions remain unchanged by design.
- The focused architecture/domain/application/schema set passed 46/46 with zero failures, errors or skips: `ArchitectureBoundaryTest`, the existing loyalty domain/persistence evidence suites, `LoyaltyReservationTranslatorTest`, `LoyaltyPersistenceMigrationTest` and `LoyaltyReservationMigrationTest`.
- The affected latest-schema regression passed 124/124 with zero failures, errors or skips (`BUILD SUCCESS`, 08:05): catalog attributes/options/prices/media/product creation, stock adjustment, delivery, recovery, calendar persistence, notification persistence/email/HTTP and the CFE baseline upgrade. Together this structural slice has 170 green checks. Compiler warnings shown by the run pre-exist outside this cut and did not fail compilation or tests.
- Transactional reservation command ports and runtime writers are not yet claimed.
