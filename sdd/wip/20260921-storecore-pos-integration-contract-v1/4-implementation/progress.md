# Implementation Progress
**Status**: in_progress | **Strategy**: batched

Fail-closed under Sol `20260923-sol-pos-impl-go.md`. HTTP remains 403 `CAPABILITY_DISABLED` except OpenAPI draft. Isolated saga/catalog engines plus a capability-first facade exist. Dual Grok r4 both `APPROVED`. No activation, PR, or archive until asked.

| ID | Task | Status | Commit |
|----|------|--------|--------|
| TASK-PIC-001 | Capability BLACKSTORE_INTEGRATION and companion 0..1 | completed | 8dd60b5 |
| TASK-PIC-002 | DDL saga, tombstone, lines, cursor, ledger pairing | completed | 8dd60b5 |
| TASK-PIC-003 | Catalog/stock engine + facade; HTTP 403 while DISABLED | in_progress | uncommitted facade |
| TASK-PIC-004 | Reserve engine + facade; HTTP 403 while DISABLED | in_progress | uncommitted facade |
| TASK-PIC-005 | Commit/release/expiry engine; worker expireDue only if enabled | in_progress | uncommitted facade |
| TASK-PIC-006 | GET/reconcile/purge engine; HTTP 403 while DISABLED | in_progress | uncommitted facade |
| TASK-PIC-007 | Isolated limiter + Retry-After; HTTP deny-first does not charge RPS | in_progress | uncommitted |
| TASK-PIC-008 | OpenAPI 1.0.0-draft served | completed | 8dd60b5 |
| TASK-PIC-009 | ML listing adapter returns false; no enqueue on 403 | in_progress | uncommitted |
| TASK-PIC-010 | V7 future_optional flip; module stays DISABLED | completed | uncommitted V7 |
| TASK-L3-001 | Concurrent saga review | in_progress | `20260923-l3-001-concurrent-saga.md` |
| TASK-L3-002 | Permissions / offline review | in_progress | `20260923-l3-002-permissions-offline.md` |
| TASK-L3-003 | OpenAPI / reconcile review | in_progress | `20260923-l3-003-openapi-reconcile.md` |

## Validations (2026-09-23)

- `mvn -Dtest=BlackStoreRateLimiterTest,BlackStoreSagaEngineTest,BlackStoreFailClosedHttpTest,BlackStoreSchemaMigrationTest,BlackStoreIntegrationServiceTest test` (local, exit 0 after facade)
- Not CI green. Isolated engine coverage unchanged. Facade: DISABLED never calls limiter/catalog/saga; enabled double is a port fake only. HTTP still 403. Advice emits `lineFailures` on saga errors.

## Residuals (honest)

- `done` is only PIC-001, PIC-002, PIC-008.
- HTTP mutating/read routes stay 403. Do not wire engines to HTTP to close ACs under this GO.
- Isolated `BlackStoreRateLimiter` (30/10 reserve, 60 catalog/stock, 5 reconcile) + `Retry-After` on 429 advice. HTTP requireEnabled runs first, so DISABLED traffic does not charge RPS.
- Scheduled expiry/purge workers stay no-op.
- Engine: duplicate variant rejected; `INSUFFICIENT_STOCK` carries `requested`/`availableQuantity`; missing balance is sellable 0; deadlock maps to retryable CONFLICT.
- Dual Grok r4: `20260923-grok-pos-pic-001-009-sdd-r4.md` and `20260923-grok-pos-pic-001-009-scope-r4.md` both `APPROVED`. PIC-003..007/009 stay `in_progress` (HTTP ACs need 200). PIC-007 stays `in_progress` (HTTP does not enforce RPS while DISABLED). L3 drafts stay `in_progress`.
- No `/sdd.finish`.
