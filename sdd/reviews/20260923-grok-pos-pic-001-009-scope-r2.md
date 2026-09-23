VERDICT: APPROVED

# Grok 4.7 — POS PIC-001..009 scope r2

**Lane:** implementation
**Branch:** `feature/pos-pic-001-009-fail-closed`
**Prior:** `20260923-grok-pos-pic-001-009-scope.md` (`CHANGES_REQUIRED`), `20260923-grok-pos-pic-001-009-sdd.md` (`CHANGES_REQUIRED`)
**Validations:** local Maven only. Not CI green. No GitHub PR.

| Command | Result |
| --- | --- |
| `mvn -q "-Dtest=BlackStoreSagaEngineTest,BlackStoreFailClosedHttpTest,BlackStoreSchemaMigrationTest" test` from `backend/` | **PASS**, exit 0, 2026-09-23 15:46. `BlackStoreSagaEngineTest` 10/10, `BlackStoreFailClosedHttpTest` 2/2, `BlackStoreSchemaMigrationTest` 3/3. |

## Why / GO

Sol `20260923-sol-pos-impl-go.md` remains `CONDITIONAL_GO` for PIC-001..009 fail-closed only. This r2 checks the scope findings from the first lane, not a new activation gate.

`tasks.json` `stats.done=3`. Status is `done` only for PIC-001, PIC-002, and PIC-008. PIC-003, PIC-004, PIC-005, PIC-006, PIC-007, and PIC-009 are `in_progress`. PIC-010 and L3-001..003 stay `pending`. `progress.md` matches that split: HTTP 403, engines unwired, rate limit and `Retry-After` not implemented, worker no-op, ML adapter returns false.

## Closed findings

- **HTTP stays deny-only.** `BlackStoreIntegrationController` still maps catalog, stock, reserve, commit, release, GET, and reconcile to `deny()`. Both branches throw `BlackStoreCapabilityDisabled`. The controller does not inject the saga or catalog engines. `BlackStoreExpiryWorker` still returns 0 and does not call `expireDue`, `purgeDue`, or `deleteStalePending`. OpenAPI draft remains the PIC-008 200 exception.
- **`lineFailures` carry sellable quantity.** `BlackStoreLineFailure` has `requested` and `availableQuantity`. Insufficient stock of 4 against available 5 / safety 2 asserts `requested=4` and `availableQuantity=3`, then GET is `NOT_FOUND` with reserved quantity unchanged. Tx-B still commits that claim delete.
- **Tests Sol asked for on the isolated engine are present and passed.** Concurrent identical quadruple yields one receipt and reserved quantity 2. Commit versus expire leaves a single terminal state (`COMMITTED` sellable 3, or `EXPIRED` sellable 5) and reserved 0. Reconcile asserts ledger count, available, reserved, and operation count unchanged. Tombstone get and re-POST assert `410` and `retryable=false`. `deleteStalePending` removes a PENDING row older than 60s and does not change the ledger count. Duplicate variant lines throw `DUPLICATE_VARIANT` before reserve. A variant with no balance row is sellable 0 (`LEFT JOIN` + `COALESCE`) and fails `INSUFFICIENT_STOCK` with `requested=1`, `availableQuantity=0`. `includeCost=true` is `COST_SCOPE_REQUIRED` 403. A non-catalog price version is `PRICE_VERSION_MISMATCH` 409. The engine `JdbcTemplate` URL is the Testcontainers URL and does not name a BlackStore database. The same test rejects `sk_live_`, `Bearer `, a PAN-shaped digit string, and `cvv` in the exception text.
- **Fail-closed still holds.** Module seed stays `DISABLED` and `future_optional=true`. Flyway V6 is saga DDL, not the PIC-010 flip. Ledger writes stay `RESERVATION` / `RELEASE` / `STOCK_COMMIT_EXTERNAL` on `EXTERNAL_BLACKSTORE`. Deadlock/`40P01` is mapped to retryable `409 CONFLICT` after the transaction rolls back. The ML port still returns false. No `store_id`, no fiscal path, no live companion, `EffectivePrice*.kt` is not referenced.

## Gaps vs backend standards

Unchanged and non-blocking for this gate: fat JDBC engines without saga/catalog ports, tombstone `UPDATE`/`DELETE` granted to `storecore_runtime` with no immutability trigger, cursor token prefix is a variant id plus UUIDv5 (not an HMAC). The HTTP advice still sends `data=null` and does not emit `lineFailures` or `Retry-After`, because operational routes never throw saga errors. That remains PIC-007 `in_progress`, not a done mark.

Price-override coverage is the engine rejecting a price version other than `catalog-{productId}`. It is not an HTTP bearer scope check. Cost is always forbidden on the isolated catalog query. Both match fail-closed while the routes stay on `deny()`.

## Residual NO-GO

PIC-010, `future_optional=false`, activating or pausing `BLACKSTORE_INTEGRATION`, live BlackStore, fiscal, MP-LIVE-05, and `/sdd.finish` stay NO-GO. This lane does not merge. The SDD lane file is still `CHANGES_REQUIRED` until that lane re-reviews. Do not wire HTTP to the engine to close the remaining in-progress tasks under this GO.
