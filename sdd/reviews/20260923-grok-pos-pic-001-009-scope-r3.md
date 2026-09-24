VERDICT: APPROVED

# Grok 4.7 — POS PIC-001..009 scope r3

**Lane:** implementation
**Branch:** `feature/pos-pic-001-009-fail-closed`
**Prior:** `20260923-grok-pos-pic-001-009-scope-r2.md` (`APPROVED`), `20260923-grok-pos-pic-001-009-sdd-r2.md` (`APPROVED`)
**Validations:** local Maven only. Not CI green. No GitHub PR. No commit, merge, or activation.

| Command | Result |
| --- | --- |
| `mvn -q "-Dtest=BlackStoreRateLimiterTest,BlackStoreSagaEngineTest,BlackStoreFailClosedHttpTest,BlackStoreSchemaMigrationTest" test` from `backend/` | **PASS**, exit 0, 2026-09-23 16:05. `BlackStoreRateLimiterTest` 3/3, `BlackStoreSagaEngineTest` 10/10, `BlackStoreFailClosedHttpTest` 2/2, `BlackStoreSchemaMigrationTest` 3/3. Flyway applied V1–V6 only. |

## Why / GO

Sol `20260923-sol-pos-impl-go.md` remains `CONDITIONAL_GO` for PIC-001..009 fail-closed only. This r3 checks the isolated PIC-007 rate limiter added after r2. It is not an activation gate.

`tasks.json` `stats.done=3`. Status is `done` only for PIC-001, PIC-002, and PIC-008. PIC-003, PIC-004, PIC-005, PIC-006, PIC-007, and PIC-009 are `in_progress`. PIC-010 and L3-001..003 stay `pending`. `progress.md` matches: HTTP 403, engines unwired, PIC-007 is an isolated token bucket plus `Retry-After` on 429 advice, and HTTP `deny()` does not call the limiter. `STATUS.md`, `TRACEABILITY.md`, and TODO-040 stay fail-closed and do not claim PIC-007 done, live, or production-ready.

## Closed findings

- **HTTP stays deny-only 403.** `BlackStoreIntegrationController` still maps catalog, stock, reserve, commit, release, GET, and reconcile to `deny()`. Both branches throw `BlackStoreCapabilityDisabled`. The controller does not inject `BlackStoreRateLimiter`, the saga engine, or the catalog query. `BlackStoreFailClosedHttpTest` asserts 403, `CAPABILITY_DISABLED`, no `Retry-After`, and no PAN/`sk_live_`/`cvv`/`password=` on those routes. OpenAPI draft remains the PIC-008 200 exception. Operations and `EXTERNAL_BLACKSTORE` ledger stay at 0. The expiry worker still returns 0. The ML port still returns false.
- **Limiter is isolated.** `BlackStoreRateLimiter.check` is referenced only by its own class and `BlackStoreRateLimiterTest`. Reserve allows a burst of 10 then throws `RATE_LIMITED` 429 `retryable=true` with `retryAfterSeconds >= 1`. A second identity is not charged. Reconcile allows 5 then 429. Contract constants match the registry seed: reserve 30/s burst 10, catalog and stock-read 60/s, reconcile 5/s.
- **`Retry-After` is advice-only and only on 429.** `BlackStoreIntegrationExceptionAdvice` adds `Retry-After` when `httpStatus == 429`, using `BlackStoreSagaException.retryAfterSeconds` (fallback 1). The unit test sees header `2` for `rateLimited(2)`, `errorCode=RATE_LIMITED`, `retryable=true`, and no secret literals. `BlackStoreCapabilityDisabled` stays 403 with no `Retry-After`.
- **Fail-closed still holds.** Module seed stays `DISABLED` and `future_optional=true`. Flyway V6 is saga DDL, not the PIC-010 flip. No new migration, no `future_optional=false`, no live companion, no fiscal path, no secrets. `EffectivePrice*.kt` stays untracked and is not referenced by this slice.

## Gaps vs backend standards

Non-blocking for this gate. The limiter is an in-memory `@Component` with no port and no bucket eviction, and its clock is not injectable, so refill over time is not unit-tested. That is acceptable while nothing on the request path calls `check`. Advice still returns `data=null` and does not emit `lineFailures`, because operational routes never throw saga errors. Wiring the limiter into the controller to “finish” PIC-007 would enforce RPS on a route that must stay deny-only under this GO.

`tasks.json` still cites the first SDD review as `CHANGES_REQUIRED` and says rate limits are not closed. That citation is the historical finding r2 already closed. “Not closed” remains true: HTTP does not enforce RPS, so PIC-007 stays `in_progress`.

## Residual NO-GO

PIC-010, `future_optional=false`, activating or pausing `BLACKSTORE_INTEGRATION`, live BlackStore, fiscal, MP-LIVE-05, and `/sdd.finish` stay NO-GO. This lane does not merge. Do not mark PIC-007 done, and do not call the limiter from the controller, under this GO.
