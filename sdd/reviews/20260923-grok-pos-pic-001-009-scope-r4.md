VERDICT: APPROVED

# Grok 4.7 — POS PIC-001..009 scope r4

**Lane:** implementation / scope
**Branch:** `feature/pos-pic-001-009-fail-closed` @ `8dd60b5` plus uncommitted capability-first facade
**Prior:** `20260923-grok-pos-pic-001-009-scope-r3.md` (`APPROVED`), `20260923-grok-pos-pic-001-009-sdd-r3.md` (`APPROVED`)
**Validations:** local Maven only. Not CI green. No GitHub PR. No commit, merge, or activation.

| Command | Result |
| --- | --- |
| `mvn -q "-Dtest=BlackStoreRateLimiterTest,BlackStoreSagaEngineTest,BlackStoreFailClosedHttpTest,BlackStoreSchemaMigrationTest,BlackStoreIntegrationServiceTest" test` from `backend/` | **PASS**, exit 0, 2026-09-23 16:28–16:29. `BlackStoreRateLimiterTest` 3/3, `BlackStoreSagaEngineTest` 10/10, `BlackStoreFailClosedHttpTest` 2/2, `BlackStoreSchemaMigrationTest` 3/3, `BlackStoreIntegrationServiceTest` 2/2. Flyway applied V1–V6 only and stopped at v6 (registry V5, saga V6). |

## Why / GO

Sol `20260923-sol-pos-impl-go.md` remains `CONDITIONAL_GO` for PIC-001..009 fail-closed only. This r4 checks the new capability-first facade. It is not an activation gate and it does not close HTTP 200 acceptance criteria.

`tasks.json` stays `status=building`, `stats.done=3`. Status is `done` only for PIC-001, PIC-002, and PIC-008. PIC-003, PIC-004, PIC-005, PIC-006, PIC-007, and PIC-009 stay `in_progress`. PIC-010 stays `pending`. L3-001..003 stay `in_progress` even though draft notes exist. `progress.md`, `STATUS.md`, `TRACEABILITY.md`, and TODO-040 match that split: HTTP 403, facade in front of the engines, PIC-010 / live / fiscal / MP-LIVE-05 still NO-GO. No archive.

## Closed findings

- **HTTP operational routes stay 403 `CAPABILITY_DISABLED`.** `BlackStoreIntegrationController` maps catalog, stock, reserve, commit, release, GET operation, and reconcile through `BlackStoreIntegrationService`. Each of those methods calls `requireEnabled` before the limiter, catalog port, or saga port. `BlackStoreFailClosedHttpTest` asserts 403, `CAPABILITY_DISABLED`, `"code":403`, no `Retry-After`, and no PAN / `sk_live_` / `cvv` / `password=` on those routes. After those calls, `blackstore_integration_operations` is 0 and `inventory_ledger` where `channel='EXTERNAL_BLACKSTORE'` is 0. The module row stays `DISABLED` and `future_optional=true`. OpenAPI draft remains the PIC-008 200 exception and does not flip the module.
- **DISABLED path does not call engines or the limiter.** `requireEnabled` calls `CapabilityDecisionPort.decide` and, on `CapabilityDisabled`, only reads companion counts via `assertNoLiveTraffic` before throwing `BlackStoreCapabilityDisabled`. `BlackStoreIntegrationServiceTest` records limiter, catalog, and saga calls at 0 across catalog, stock, reserve, commit, release, GET, reconcile, `expireDue`, and `purgeDue`. Production `decide` throws `CapabilityDisabled` when state is `DISABLED` before any actor allow-list, and that method only `SELECT`s. The JDBC saga engine is not referenced by the controller. Commit/release enqueue ML only inside the saga engine, which this path does not reach. `DisabledBlackStoreMlListingAdapter` still returns `false`.
- **Workers return 0 while DISABLED.** `BlackStoreExpiryWorker.expireReserved` and `purgeTerminal` delegate to `expireDue` / `purgeDue`. `runWhenEnabled` catches `CapabilityDisabled` and returns 0 without calling `saga.expireDue` or `saga.purgeDue`. The HTTP test asserts both worker methods return 0 against the real disabled row.
- **PIC-007 stays `in_progress`.** The isolated limiter still allows a reserve burst of 10 then `429` `RATE_LIMITED` with `Retry-After >= 1`, and reconcile allows 5 then `429`. Deny-first HTTP never reaches `BlackStoreRateLimitPort.check`, so disabled traffic does not charge RPS and does not emit `Retry-After`. Do not mark PIC-007 done.
- **Advice emits `lineFailures` only for saga errors.** `BlackStoreIntegrationExceptionAdvice` maps a non-empty `BlackStoreSagaException.lineFailures` onto the envelope and adds `Retry-After` only when `httpStatus == 429`. The limiter unit test sees `Retry-After: 2` on `rateLimited(2)`, and on `insufficient(...)` sees 409 `INSUFFICIENT_STOCK` with `variantId=9`, `requested=4`, `availableQuantity=1`. The same test, and the HTTP test, see 403 with no `Retry-After`.
- **Enabled-double is acceptable.** `enabled double reaches catalog limiter and saga without flipping the real module` constructs `BlackStoreIntegrationService` with a `CapabilityDecisionPort` fake, a no-op `BlackStoreCompanionGuard`, and recording ports. When `disabled=false` the fake returns normally and never calls `JdbcCapabilityService`, SQL, or `changeState`. It does not set `ACTIVE` and does not set `future_optional=false`. The schema test separately attempts `changeState(..., ACTIVE)` and expects `CapabilityConfigInvalid`, then asserts the row is still `DISABLED`. That is a port fake, not a module activation, and it is acceptable for this gate.
- **Fail-closed registry is unchanged.** V5 seeds `BLACKSTORE_INTEGRATION` as `DISABLED`, `future_optional=true`, schema v2. Flyway V6 is saga DDL; its header says it is not the PIC-010 flip. No V7. No `future_optional=false`. No live companion, fiscal path, HMAC invention, or secret. `EffectivePrice.kt`, `EffectivePriceQueryPort.kt`, and `JdbcEffectivePriceQueryAdapter.kt` stay untracked and are not referenced by this slice. `docs/agent/*` leftovers stay untracked and out of this review.

## Gaps vs backend standards

Non-blocking for this gate. `BlackStoreIntegrationService` imports `JdbcCapabilityService.BLACKSTORE_MODULE` from infrastructure; the decision itself still goes through `CapabilityDecisionPort`. `assertNoLiveTraffic` uses `check`, so a pre-existing operation or `EXTERNAL_BLACKSTORE` row would surface as `IllegalStateException` instead of 403 `CAPABILITY_DISABLED`, still without calling the limiter or engines. The tested empty database stays 403. The advice wire copies `variantId`, `sku`, `requested`, and `availableQuantity`, and drops line `code` / `lineIndex`. That matters only if a saga error reaches HTTP, which the disabled routes do not do. The limiter is still an in-memory bucket with a non-injectable clock. Isolated `JdbcBlackStoreSagaEngine` / catalog tests still call JDBC while the registry row stays `DISABLED`; that is direct engine coverage, not the HTTP or worker path, and it does not flip the module.

`tasks.json` still has a documentary note that “V6=PIC-010 future_optional flip”. Flyway V6 on disk is the saga. The later note correctly keeps PIC-003..007 and PIC-009 `in_progress`.

## Residual NO-GO

PIC-010, `future_optional=false`, activating or pausing `BLACKSTORE_INTEGRATION`, live BlackStore, fiscal, MP-LIVE-05, and `/sdd.finish` stay NO-GO. Do not mark PIC-003, PIC-004, PIC-005, PIC-006, PIC-007, or PIC-009 done: their HTTP acceptance criteria need 200, and this GO forbids that. Do not mark L3-001..003 done from the drafts. This lane does not merge.
