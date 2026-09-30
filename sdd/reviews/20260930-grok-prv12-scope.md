VERDICT: APPROVED

# Grok 4.7 — POSC-002F scope/ACL review (SCOPE lane)

**Date:** 2026-09-30  
**Lane:** SCOPE  
**Feature:** POSC-002F — matriz de aceptación y regresión (test-only)  
**Branch:** `feature/posc002f-acceptance-matrix` @ `7579d1d` (integration head) plus **uncommitted working-tree delta**  
**PR:** none yet  
**Integration head (committed):** `7579d1d` (`Merge pull request #69 … POSC-002E companion guards`)  
**Reviewed against:** `sdd/wip/20260927-pos-integration-convergence/3-tasks/posc002-implementation-slices.md` (POSC-002F), `AGENTS.md`  
**No merge.** This file does not approve GitHub, does not call CI green, does not authorize deploy/tag/push, and does not authorize `/sdd.finish`.

## What was read

1. `AGENTS.md`, POSC-002F slice ownership/acceptance and local status line (test-only matrix, residuals 002B/002C/ML RR).
2. Prior SCOPE format: `sdd/reviews/20260929-grok-prv11-scope.md`.
3. Full working-tree delta: SDD traceability only (`sdd/STATUS.md`, `posc002-implementation-slices.md`, `tasks.json`); **no production or Flyway edits**. Untracked `Posc002fAcceptanceMatrixTest.kt` (7 tests) and `Posc002fHttpLoopbackTest.kt` (1 test).
4. Confirmed delta is test-only plus honest SDD status — zero changes under `backend/src/main/` or `db/migration/`.

## SDD why (002F)

POSC-002F closes the acceptance matrix gap after 002E merge: PG16 Testcontainers and HTTP loopback record checksum/upgrade integrity, Tx-A/Tx-B revoke and kill-switch deny paths, read-guard GET deny without writes, cursor UPSERT, ownership HTTP 404/reconcile unknown, pinned eight-route contract digest, and explicit recording of open residuals (`INSERT(variant_id)`, companion-admin HTTP, Tx-S, ML RR admin-wins) without faking them as granted.

## Scope checklist

| Requirement | Code | Tests | Result |
| --- | --- | --- | --- |
| Test-only; no commercial/production code; no Flyway edits | PASS | PASS — diff is SDD + `src/test/` only | PASS |
| V1–V10 upgrade with seeded rows; BLACKSTORE stays DISABLED post-migrate | PASS | PASS — `v1ThroughV10ChecksumsAndUpgradeKeepBlackStoreDisabled` | PASS |
| Pinned checksums (V3/V5/V8/V9 LF-normalized SHA-256) | PASS | PASS | PASS |
| Revoke between Tx-A/Tx-B → PENDING; no reservation/ledger | PASS | PASS — `revokeBetweenTxAAndTxBLeavesPendingWithoutReserve` | PASS |
| Kill reserve denies without new claim/ops/ledger | PASS | PASS — `killSwitchDeniesReserveWithoutClaimOrLedger` | PASS |
| Kill commit/release deny; reserved stock untouched | PASS | PASS — `killOnCommitAndReleaseLeavesReservedStockUntouched` | PASS |
| DISABLE before read guard → GET deny; no ledger writes | PASS | PASS — `disableBeforeReadGuardDeniesGetAndLeavesNoWrites` | PASS |
| Cursor UPSERT stable replay; CURSOR_EXPIRED on catalog bump | PASS | PASS — `cursorUpsertAndBalanceInsertPrivilegeHold` | PASS |
| `INSERT(variant_id)` residual recorded **false**, not silently granted | PASS | PASS — explicit assert + message | PASS |
| Runtime guard EXECUTE; companions UPDATE denied; guard owner NOLOGIN | PASS | PASS | PASS |
| Eight contract routes pinned; OpenAPI artifact present | PASS | PASS — `eightContractRoutesStayPinnedAndAdminHttpResidualsStayOpen` | PASS |
| 002B/002C HTTP residuals not faked (no CompanionAdmin controller; no `capability_tx_c_execute`) | PASS | PASS | PASS |
| ML RR admin-wins recorded NO-GO, not approved in this slice | PASS | PASS — slices text assertion | PASS |
| HTTP missing operation → 404 NOT_FOUND | PASS | PASS — `foreignGetIs404AndDeniedReserveLeavesNoLedger` | PASS |
| Reconcile unknown receipts; capability restored DISABLED after HTTP test | PASS | PASS | PASS |
| Temporary ACTIVE only in test lifecycle; final state DISABLED | PASS | PASS — matrix `@BeforeAll` activate + HTTP `finally` disable | PASS |

## Recorded validation (not CI)

| Run | Command / scope | Result | Timestamp |
| --- | --- | --- | --- |
| 1 | `mvn -Dtest="Posc002fAcceptanceMatrixTest,Posc002fHttpLoopbackTest" test` — **8 tests, 0 failures** (7 matrix + 1 HTTP) | BUILD SUCCESS | 2026-09-30T00:17:45-03:00 |

Local PG16 Testcontainers only — not GitHub CI green.

## Findings (SCOPE lane)

- **Slice boundary is respected:** working tree adds only acceptance/regression tests and SDD traceability; no migration, engine, controller, or capability adapter changes — aligned with “sin código comercial nuevo.”
- **P1 residuals from 002E are evidenced, not re-opened as production work:** revoke Tx-A/Tx-B, kill reserve/commit/release deny-without-side-effects, GET-after-DISABLE read deny, cursor UPSERT, and ownership HTTP paths all have focused PG16/loopback assertions with numeric before/after counts.
- **Open gates stay honestly open:** `has_column_privilege(...,'INSERT')=false` for `inventory_balances.variant_id`; no `CompanionAdmin*` controller; `JdbcCapabilityService` lacks `capability_tx_c_execute(`; slices doc asserts ML RR admin-wins as separate NO-GO — none are silently claimed closed.
- **Fail-closed restore:** both suites leave `BLACKSTORE_INTEGRATION` DISABLED and `channel_outbox` LISTING_STOCK count at zero after temporary activation.
- **Informational (non-blocking):** full slice aspirational bar (provider outage, scope denial matrix, nine admin commands, CSRF, replay, migrator/foreign-role harness, WEB/ML catalog regression, HTTP-layer kill/revoke deny) remains deferred per slice status line — correctly documented as 002B/002C/002G residuals, not scope creep in this delta; HTTP test name references denied-reserve ledger but engine matrix covers deny-without-ledger at saga port (HTTP deny path still open for a future HTTP residual slice).

## Residual gates (out of 002F SCOPE lane)

- POSC-002G rollout/runbook, dual SDD lane review, merge to `integration/storecore-int`.
- Companion-admin HTTP (nine commands, CSRF), Tx-S capability HTTP, `INSERT(variant_id)` grant — 002B/002C residuals.
- ML REPEATABLE READ admin-wins — separate NO-GO per proposal; not approved here.

## Summary

POSC-002F SCOPE lane **APPROVED**. Test-only matrix meets the pinned local acceptance bar: no production/Flyway drift, P1 deny/revoke/read/cursor/ownership evidence recorded, residuals explicitly false/open, and 8/8 PG16 tests BUILD SUCCESS. This verdict is scope-only — no merge, no GitHub approve, no `/sdd.finish`.
