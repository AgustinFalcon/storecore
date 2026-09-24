# Implementation Progress
**Status**: local_done | **Strategy**: batched

Thirteen local tasks have evidence. PR #19 is merged on `master` as `18d18f7` after dual Grok r2 both APPROVED. HTTP 200/304/409/410/429 exists only inside the Testcontainers CAS temporary ACTIVE. Outside that test the module stays DISABLED and HTTP is 403. PIC-009 writes `channel_outbox` only on that temporary ACTIVE commit. No live companion and no `/sdd.finish`.

| ID | Task | Status | Evidence |
|----|------|--------|----------|
| TASK-PIC-001 | Capability BLACKSTORE_INTEGRATION and companion 0..1 | completed | 8dd60b5 |
| TASK-PIC-002 | DDL saga, tombstone, lines, cursor, ledger pairing | completed | 8dd60b5 |
| TASK-PIC-003 | Catalog/stock HTTP + ETag 304 quoted/weak | done | `BlackStoreHttpContractTest` |
| TASK-PIC-004 | Reserve HTTP 200 / 409 INSUFFICIENT / 422 stale / concurrent | done | `BlackStoreHttpContractTest` + engine |
| TASK-PIC-005 | Commit HTTP 200; 409 OPERATION_STATE_CONFLICT | done | HTTP + `BlackStoreSagaEngineTest` |
| TASK-PIC-006 | GET 200/404, reconcile, purge 410 | done | `BlackStoreHttpContractTest` |
| TASK-PIC-007 | Envelope + 429 Retry-After (no Apache retry) | done | `BlackStoreHttpContractTest` |
| TASK-PIC-008 | OpenAPI 1.0.0-draft served | completed | 8dd60b5 |
| TASK-PIC-009 | Local channel_outbox LISTING_STOCK after commit | done | `JdbcBlackStoreMlListingAdapter` + HTTP test |
| TASK-PIC-010 | V7 future_optional flip; module stays DISABLED | completed | V7 |
| TASK-L3-001 | Concurrent saga review | done | `20260923-l3-001-concurrent-saga.md` |
| TASK-L3-002 | Permissions / offline review | done | `20260923-l3-002-permissions-offline.md` |
| TASK-L3-003 | OpenAPI / reconcile review | done | `20260923-l3-003-openapi-reconcile.md` |

## Validations (2026-09-23)

- `mvn -Dtest=BlackStoreHttpContractTest test` (local, exit 0)
- Activation only via `CapabilityAdministrationPort.changeState` ADMIN+reason+correlation, schema v2 re-sent. Restored DISABLED.
- Not CI green. Not live.

## Residuals (honest)

- All 13 PIC/L3 tasks have local evidence. Module stays DISABLED outside CAS Testcontainers.
- Sol `20260923-sol-remaining-gates.md`: UX-ANG, BSUX-ANG (5 rutas) y connector localhost CONDITIONAL_GO. Fiscal, MP-LIVE-05, live companion, `/sdd.finish` NO-GO.
