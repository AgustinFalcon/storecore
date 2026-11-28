# PCC-015D2 checkout binding implementation — 2026-11-28

## Status

`in_progress`. This evidence describes the local implementation candidate. It does not claim hosted CI, reviewer approval, merge, deployment, provider-live behavior or completion. PCC-015D and PCC-015 remain `in_progress`; PCC-015D3, PCC-015E and PCC-015F remain pending.

## Observable delivery cut

- `CheckoutLoyaltySelection` is a closed Kotlin type with one boundary translator and an explicit `Unknown` case. Checkout internals do not compare wire strings.
- The replay fingerprint distinguishes no selection from a reservation selection and binds reservation id plus expected revision to the stable cart identity.
- Fingerprints are explicitly versioned at the persistence boundary. Historical unversioned/V1 claims replay only with `None`; V2 claims compare the selection-aware fingerprint; unknown versions fail closed.
- Products, variants, source evidence, inventory and reservation allocations are locked and revalidated in deterministic order before local order creation.
- Order, payment, immutable loyalty snapshots and reservation-to-order binding are written in one local transaction before any remote provider attempt.
- `order_items` retain gross commercial values. Orders, payments, provider attempts and reporting use the frozen net payable amount.
- Available loyalty evidence is reported from immutable payable snapshots; unavailable or legacy evidence keeps the existing gross-order fallback.
- V45 is forward-only. V1–V44 migrations and their checksums remain unchanged.

## Database authority and failure behavior

- V45 exposes narrow `SECURITY DEFINER` functions owned by `storecore_migrator`, with fixed `search_path` and fully qualified objects.
- `storecore_runtime` receives function execution only; it does not receive broad loyalty-table DML.
- Deferred closure checks execute with migrator authority so commit-time validation remains effective under the runtime role.
- Fingerprint drift, expired/non-quoted reservations, allocation drift, insufficient stock, frozen evidence mutation and replay conflicts fail closed and roll back the local transaction.

## Local evidence

### Focused historical replay regression

Command: `mvn.cmd -B "-Dtest=MpOrdersCheckoutIntegrationTest#legacy*" test`

Result: 1 test, 0 failures, 0 errors, 0 skipped. A completed pre-V2 claim replays without duplicating the order, preserves the absence of loyalty evidence and can attach a verified remote checkout afterwards.

### Integrated D2 matrix

Command: `mvn.cmd -B "-Dtest=CheckoutCommandFingerprintCompatibilityTest,LoyaltyCheckoutBindingTest,LoyaltyCheckoutEvidenceTest,LoyaltyAtomicCheckoutMigrationTest,LoyaltyCheckoutEvidenceMigrationTest,StoreCoreCreatedOrderReportPostgresTest,MpOrdersCheckoutIntegrationTest" surefire:test`

Result: 96 tests, 0 failures, 0 errors, 0 skipped; PostgreSQL 16 Testcontainers; build successful. This includes closed fingerprint-version compatibility, historical replay, two-writer binding races, cancellation/expiry races, fresh-time expiry after lock waits, session revocation while waiting, wallet revision exhaustion and `PAYMENT_PENDING` terminal protection.

### V1–V45 compatibility

Command: `mvn.cmd -B "-Dtest=CatalogAttributeOrderMigrationTest,CatalogOptionSchemaMigrationTest,DeliveryMigrationTest,NotificationPersistencePostgresTest,VariantPriceMigrationTest,NotificationHttpIntegrationTest,NotificationEmailIntegrationTest,CalendarPersistencePostgresTest,RecoveryDeliveryMigrationTest,CfeBaselineUpgradeMigrationTest,CatalogMediaMigrationTest,RecoveryHttpIntegrationTest,StockAdjustmentMigrationTest,MediaProductCreationPostgresTest,LoyaltyReservationCommandMigrationTest" test`

Result: 139 tests, 0 failures, 0 errors, 0 skipped; build successful. Clean installs and historical upgrades reached V45 while their pre-existing history/checksum assertions remained intact.

### Pending gates before PR completion

- two independent GPT-6.1 Sol medium reviews: architecture/domain/bug lane and database/security/concurrency lane.
- hosted PR CI and exact-head review receipts.

### Hosted CI corrective iteration

- PR #466 run `46122669702` completed the full backend suite with 970 tests, 0 failures, 1 error and 1 skipped. The only error was `StoreCoreApplicationTest.contextLoads`: `LoyaltyCheckoutEvidenceService` was registered while the smoke context intentionally disabled identity and `DataSourceAutoConfiguration`, so no `JdbcTemplate` existed.
- Root cause: `JdbcCartService` already shares the `storecore.identity.enabled` lifecycle, but its newly extracted JDBC collaborator did not. The service now has the same `@ConditionalOnProperty` boundary; no database or checkout behavior was weakened.
- Regression command: `mvn.cmd -B -f backend/pom.xml "-Dtest=StoreCoreApplicationTest" test`.
- Regression result: 1 test, 0 failures, 0 errors, 0 skipped; build successful.
- Post-correction integrated matrix: the complete 96-test D2 matrix above passed again against PostgreSQL 16 with 0 failures, 0 errors and 0 skipped.

### Corrective history retained

- The first combined run exposed one failure in the new historical replay scenario: the fake provider was still configured to return timeout, so no checkout URL could be attached. The fixture was corrected to return a verified provider success; the focal regression and the complete 96-test matrix then passed.
- The concurrency matrix was iterated from invalid fixtures to valid security evidence and root SQL-state assertions before reaching 7/7 green. Production V45 did not need to be weakened for those corrections.
- The first hosted CI run exposed the missing bean lifecycle condition described above. The exact CI failure is retained here; the correction is covered by the previously failing smoke test and by a fresh 96-test D2 matrix.

### Structural gate

`git diff --check`: PASS. The two reported messages are line-ending conversion warnings for pre-existing Kotlin test files, not whitespace errors.

## Explicit exclusions

- No strict loyalty checkout HTTP request contract, Angular selection/recovery UX or capability activation; those belong to PCC-015D3.
- No provider-live credential, deployment or homologation claim.
- No accreditation or correction activation; those belong to PCC-015E and PCC-015F.
