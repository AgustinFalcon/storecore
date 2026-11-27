# PCC-015D1 evidence implementation — 2026-11-27

## Status and bounded scope

PCC-015D1 is in progress. This cut is limited to pure checkout evidence and exact-money domain types, deterministic allocation, and a forward-only non-operative evidence schema. It does not activate a runtime writer, checkout binding, HTTP route, Angular integration, capability grant, provider call, scheduler or accreditation. PCC-015D remains `in_progress`; D2-D3 and the later delivery slices remain pending.

## Implemented surface

- `backend/src/main/kotlin/com/storecore/loyalty/domain/LoyaltyCheckoutEvidence.kt`
- `backend/src/main/kotlin/com/storecore/loyalty/domain/LoyaltyCheckoutFlow.kt`
- `backend/src/main/resources/db/migration/V44__loyalty_checkout_evidence.sql`
- `backend/src/test/kotlin/com/storecore/loyalty/domain/LoyaltyCheckoutEvidenceTest.kt`
- `backend/src/test/kotlin/com/storecore/schema/LoyaltyCheckoutEvidenceMigrationTest.kt`
- `backend/src/test/kotlin/com/storecore/schema/LoyaltyReservationCommandMigrationTest.kt`

The domain uses closed types and fail-closed admission for catalog classification, currency, evidence kind, unavailable reason and evidence purpose. Wire-like inputs cross one translator and unknown values are not presented as valid states. Monetary calculations use exact integer minor units with checked wide intermediates before bounded conversion. Quote and final evidence keep exact cart, profile, price, tax, discount and item correlations; allocation is deterministic.

The V44 migration is additive and leaves V42-V43 byte-for-byte unchanged. New evidence is append-only, runtime access is read-only, historical rows are not inferred or backfilled, and no production capability is enabled.

## Review corrections

The first independent schema review rejected the cut because a row could be moved into an already frozen order and because an order `xmin` could be refreshed by an update before historical evidence insertion. Both bypasses are now closed:

- frozen order-item protection checks both the source and destination order on update, with AVAILABLE and UNAVAILABLE snapshot regressions proving SQLSTATE `23514` and an unchanged line bijection;
- `orders.loyalty_creation_xid` is nullable with no default or backfill, is forced only by the order INSERT trigger, is immutable afterwards, and is compared with `IS DISTINCT FROM pg_current_xact_id()` before an order snapshot is admitted. Historical pre-V44 and committed post-V44 orders cannot acquire late evidence after a no-op update.

## Validation evidence

The corrected focused migration test passed against PostgreSQL 16.14 through Testcontainers: 1/1, zero failures, errors or skips, exercising clean install and V43 upgrade.

The complete serial focused suite then passed on 2026-11-27:

```text
mvn '-Dtest=LoyaltyCheckoutEvidenceTest,LoyaltyPolicyTest,LoyaltyReservationTest,LoyaltyCheckoutEvidenceMigrationTest,LoyaltyPersistenceMigrationTest,LoyaltyReservationCommandMigrationTest,LoyaltyReservationMigrationTest' test
Tests run: 41, Failures: 0, Errors: 0, Skipped: 0
BUILD SUCCESS
Total time: 03:10 min
Finished at: 2026-11-27T17:28:47-03:00
```

Those 41 tests comprise 20 pure domain tests and 21 PostgreSQL migration/upgrade tests. The migration checks include exact money and profile constraints, immutable evidence, runtime read-only privileges, clean and upgrade compatibility, pending/reconciliation holds, historical no-backfill, atomic creation, frozen source/destination orders, and bounded database-clock polling for expiry tests.

## Remaining work

- Obtain two independent exact-diff approvals and hosted CI evidence.
- Keep PCC-015D1 `in_progress` until its hosted PR is merged and its closeout is recorded.
