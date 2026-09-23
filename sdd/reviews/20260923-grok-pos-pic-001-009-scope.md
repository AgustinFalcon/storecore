VERDICT: CHANGES_REQUIRED

# Grok 4.7 — POS PIC-001..009 scope

**Lane:** implementation
**Branch:** `feature/pos-pic-001-009-fail-closed`
**Head:** `8dd60b5` plus uncommitted saga/catalog/policy/tests and SDD status edits. No GitHub PR.
**Validations:** local Maven only. GitHub CI was not run and is not green.

| Command | Result |
| --- | --- |
| `git log --oneline origin/master..HEAD` | `8dd60b5` Land fail-closed BLACKSTORE_INTEGRATION for PIC-001..009. |
| `git diff origin/master...HEAD` | 17 files, +1501/−7. Flyway V5 registry, Flyway V6 saga DDL, deny-only controller, no-op worker, OpenAPI draft, fail-closed HTTP test, schema test. |
| `git diff` / `git status` | Uncommitted in-scope: `JdbcBlackStoreSagaEngine.kt`, `JdbcBlackStoreCatalogQuery.kt`, `BlackStoreSagaPolicy.kt`, `BlackStoreSagaEngineTest.kt`, exception-advice saga mapping, `tasks.json` status `done` ×9, `progress.md`. Out of scope and not treated as GO: untracked `EffectivePrice*.kt`, `docs/agent/*`. |
| `mvn -q "-Dtest=BlackStoreSagaEngineTest,BlackStoreFailClosedHttpTest,BlackStoreSchemaMigrationTest" test` (from `backend/`) | **PASS**, exit 0. `BlackStoreFailClosedHttpTest` 2/2, `BlackStoreSagaEngineTest` 6/6, `BlackStoreSchemaMigrationTest` 3/3. Surefire timestamps 2026-09-23 15:33. Older surefire failures (`EffectivePriceConsistencyTest`, `IdentityPostMergeRegressionTest`) are from 2026-09-22 and were not part of this command. |

## Why / GO

Sol `20260923-sol-pos-impl-go.md` is `CONDITIONAL_GO` for TASK-PIC-001..009 only: module stays `DISABLED`, `future_optional=true`, HTTP and associated effects fail closed, local doubles only. PIC-010, live BlackStore, fiscal, and MP-LIVE-05 stay forbidden. `sdd/STATUS.md` and `progress.md` describe an isolated engine with HTTP still 403. That description matches the code. `tasks.json` `stats.done=9` does not.

Flyway `V6__blackstore_integration_saga.sql` is the saga/tombstone/ledger-pairing DDL (data-model “V5”). It does not flip `future_optional`. The prohibited PIC-010 promotion is absent. V4 was already Mercado Pago, so the registry landed as Flyway V5 and the saga as Flyway V6.

## Findings (severity)

### Important — task status overclaims a finished HTTP/rate-limit slice

`tasks.json` marks PIC-003..009 `done`. The controller never injects `JdbcBlackStoreSagaEngine` or `JdbcBlackStoreCatalogQuery`. Every catalog, stock, reserve, commit, release, GET, and reconcile method calls `deny()`, and both branches throw `BlackStoreCapabilityDisabled` (403) even if `decide()` succeeds. `BlackStoreExpiryWorker.expireReserved` / `purgeTerminal` return 0 and do not call `expireDue` / `purgeDue` / `deleteStalePending`. Rate limit, burst, and `Retry-After` are stored in schema v2 JSON and described in OpenAPI; nothing enforces them. There is no redaction test.

That 403 shell is what CONDITIONAL_GO requires. Wiring the engine into HTTP now would run stock effects while the capability is `DISABLED` and would violate the gate. The defect is marking PIC-003..007 done. `progress.md` and the tasks note already say HTTP stays 403 and rate-limit stays deferred. The status field still says `done`, including PIC-007 whose gate is “log redaction tests pass” and whose AC requires 30/10 reserve, 60/s catalog and stock-read, 5/s reconcile, and `Retry-After`.

### Important — Sol’s minimum tests are missing

Present and passing: capability `DISABLED` + `future_optional=true`, HTTP 403 with zero saga rows and zero `EXTERNAL_BLACKSTORE` ledger rows, OpenAPI `1.0.0-draft` + `OperationRetired` without activation, sequential reserve replay, insufficient/stale claim delete, mismatch keeps PENDING, release and forced expiry, purge retention then `OPERATION_RETIRED`, catalog sellable net of safety, `includeCost` → `COST_SCOPE_REQUIRED`, schema rejection of `SALE` + `EXTERNAL_BLACKSTORE`, tombstone CHECK of 7 years, `changeState(ACTIVE)` rejected.

Absent, and required by the Sol gate:

- Concurrent identical quadruple → one receipt (AC-STK-2). Only a sequential second `reserve` is tested.
- Commit versus expire as a race. The test expires first, then `commit` sees `EXPIRED`.
- Reconcile read-only proof. One post-purge call checks `unknownReceipts` and `ledger count >= 1`. It does not assert zero ledger/balance writes across the call.
- Redaction: no log test, and the new code has no redaction assertion for PAN/PII/secrets.
- No cross-database access: no test that the engine uses only the application datasource.
- Permissions: no service-bearer scope test, no cashier denied `cost:read` / `price:override`. HTTP routes are unauthenticated and fail on capability, not on actor scope.
- `deleteStalePending` (PENDING > 60s, no ledger) is untested and unscheduled.
- Deadlock is not mapped to retryable `409 CONFLICT`. An uncaught lock exception would roll back (prior state kept) but would not produce that error code.
- Tombstone assertions check `exception.message == "OPERATION_RETIRED"` and do not assert HTTP 410 or `retryable=false`. The factory does set both.

### Important — `lineFailures` omit sellable quantity

OpenAPI `LineFailure` requires `variantId`, `sku`, `requested`, `availableQuantity` (sellable = `GREATEST(0, available_quantity - safety_stock)`). `BlackStoreLineFailure` carries `lineIndex`, `variantId`, `sku`, `code` only. AC-STK-6 asks for sellable qty on `INSUFFICIENT_STOCK`. The advice always sends `data=null` and never attaches `lineFailures`. Stock math in the engine itself is correct: reserve of 3 from available 10 / safety 2 leaves sellable 5 and reserved 3; commit leaves sellable 5 and reserved 0; release/expiry restore available and clear reserved. The failure payload does not report that sellable number.

### Compliant — lock order, Tx-B delete commit, ledger, purge

- **Tx-B lock order holds.** `finishReserve` does `pg_advisory_xact_lock` on the quadruple, tombstone `EXISTS`, saga `FOR UPDATE`, then `inventory_balances` `ORDER BY variant_id ASC FOR UPDATE OF i`, then stock checks. Tombstone throws `OPERATION_RETIRED` before mutation.
- **Tx-A** takes the advisory lock, tombstone check, and saga `FOR UPDATE`, then inserts `PENDING`. It does not lock balances. It also does not mutate them.
- **Commit/release** take advisory lock, tombstone, saga `FOR UPDATE`, then per line `inventory_reservations FOR UPDATE` and a single-row balance `UPDATE`. Lines are loaded `ORDER BY variant_id`, so balance updates follow that order. There is no preliminary `SELECT … ORDER BY variant_id FOR UPDATE` of every balance before those updates. No deadlock was demonstrated.
- **Tx-B business deletes commit.** On `CATALOG_VERSION_STALE` and `INSUFFICIENT_STOCK` / line validation, `deleteClaim` runs inside `TransactionTemplate` and the callback returns `TxOutcome` instead of throwing. The template commits the DELETE. The exception is thrown after commit. Tests then see `NOT_FOUND` and unchanged reserved quantity. `IDEMPOTENCY_PAYLOAD_MISMATCH` throws inside the transaction, so the PENDING row remains. That matches the error matrix (delete the claim in the same Tx-B; do not leave a partial reserve). The locks paragraph in the technical spec (“rollback de Tx-B”) is the stock all-or-nothing rule, and no balance/ledger write happens before those deletes.
- **Ledger.** `appendLedger` writes only `RESERVATION` (delta negative), `STOCK_COMMIT_EXTERNAL` (delta negative), and `RELEASE` (delta positive, including expiry) with channel `EXTERNAL_BLACKSTORE`. Quantity is validated `>= 1`, so `quantity_delta <> 0`. No `SALE`. No channel `POS`. The schema test rejects `SALE` + `EXTERNAL_BLACKSTORE`. Test device id `POS-1` is a `device_id`, not a ledger channel.
- **Purge.** One transaction: advisory lock, refuse an existing tombstone, saga `FOR UPDATE`, terminal state and 90 days, `INSERT` tombstone with `retention_until = now() + interval '7 years'`, `DELETE` reservation lines, `DELETE` saga. Ledger is not deleted. Later `get` and `reserve` throw `OPERATION_RETIRED`. Early purge throws `RETENTION_ACTIVE`. Reconcile of a purged receipt returns it as unknown and does not recreate the row.

### Suggestion — hex and defense in depth

`JdbcBlackStoreSagaEngine` and `JdbcBlackStoreCatalogQuery` are fat `@Component`s in the root package: SQL, transactions, and business rules together, with no output port. `domain/` and `application/port/output/` are empty. `BlackStoreSagaPolicy` and the receipt types are pure Kotlin, which is the right split, and they sit beside JDBC. The controller depends on concrete `JdbcBlackStoreCompanionStore`, owns no business SQL, and is complete only as a deny shell. The ML port is a real port; its only adapter returns `false`. Commit/release call that port after the stock transaction, including idempotent replay. While the adapter is the no-op, PIC-009 does not enqueue.

`assertNoLiveTraffic()` uses `check()`. If saga rows ever exist in the HTTP process, `deny()` throws unmapped `IllegalStateException` instead of 403. Today the HTTP test observes zero rows because nothing in the web path writes them.

Tombstones are granted `UPDATE`/`DELETE` to `storecore_runtime` and have no immutability trigger. The engine never deletes them. Anti-resurrection is application convention, not a table privilege.

`blackstoreSchemaV2Valid` in Kotlin checks that key names appear as substrings. The SQL function is the real schema check. `decide()` still throws `CapabilityDisabled` for this module. `changeState` resends the current v2 document, not `{}`, and the trigger keeps `future_optional` modules `DISABLED`.

Catalog cursor tokens are `variantId.uuidv5`. Lookup is by the full stored token; a tampered token becomes `CURSOR_EXPIRED`. That is internal cursor integrity, not an invented HMAC.

No activation bypass on the paths that exist: HTTP denies even when `decide()` would succeed, the worker returns 0, the SQL trigger blocks `ACTIVE`, the ML adapter does not send, there is no `store_id`, no fiscal DDL, no live DSN, and `EffectivePrice*.kt` is not referenced.

## Gaps vs backend standards

Prior Grok files (`20260923-grok-pr16-*`, `20260923-grok-pr17-*`, `20260923-grok-pr18-*`) reviewed MP fail-closed, frontend, and a docs-only 410 declaration. They did not review this engine, this lock order, Tx-B commit-of-delete, or the 403 shell versus the isolated saga. Fiscal readiness remains NO. MP-LIVE-05 remains blocked. Those reviews did not excuse the gaps below.

| Area | This slice |
| --- | --- |
| Domain without Spring | Policy and DTOs are framework-free. They are not under `domain/`. |
| Ports vs adapters | One port (`BlackStoreMlListingPort`). Saga and catalog have no ports. Controller injects a concrete JDBC store. |
| Controller | No business SQL, no `@Transactional`. Always 403 on operational routes. OpenAPI YAML is served at 200, which PIC-008 allows and the HTTP test covers. |
| Transactions | `TransactionTemplate` per Tx-A, Tx-B, commit, release, get, purge. Business deletes commit by returning normally. |
| Error envelope | Capability 403 uses `code=403`, `data=null`, message `Request rejected`, `errorCode=CAPABILITY_DISABLED`. Saga codes are not produced on HTTP. `lineFailures` and `Retry-After` are absent. |
| Security | No secrets, no HMAC, USER and CUSTOMER routes are untouched. BlackStore routes do not authenticate a service bearer. |
| Single-tenant | No `store_id`. |

## Residual NO-GO

Unchanged, and not introduced here: TASK-PIC-010 / `future_optional=false`, activating `BLACKSTORE_INTEGRATION`, live BlackStore or a second database, fiscal code, MP-LIVE-05, `/sdd.finish`, merge before both Grok lanes are `APPROVED`. L3-001..003 stay `pending`. Do not treat this file as merge approval.

Required before this lane can be `APPROVED`:

1. Set PIC-003..007 back to not-done, or add the missing proof and keep the `progress.md` residuals only where the work is actually still open. Do not call rate-limit, redaction, or HTTP saga wiring done.
2. Add tests Sol named: concurrent identical headers, commit-vs-expire exclusivity, reconcile with a write-count delta, tombstone `410` + `retryable=false`, redaction, single datasource / no cross-database, and scope denial for cost and price override.
3. Put `requested` and sellable `availableQuantity` on `INSUFFICIENT_STOCK` line failures in the engine model.
4. Leave HTTP deny-only until a later activation GO. Do not connect the controller or the scheduled worker to the engine in this slice.
