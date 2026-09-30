VERDICT: APPROVED

# Grok 4.7 — PR #v23 scope (POSC-004A)

**Lane:** SCOPE
**PR:** pending (`feature/posc004a-worker-purge` → `integration/storecore-int`)
**Title:** Move saga PENDING drain and terminal purge behind worker-owned SECURITY DEFINER functions
**GitHub base:** `integration/storecore-int` @ `9ff1392` (POSC-004 merge #80)
**Branch:** `feature/posc004a-worker-purge` @ `def7d6a` (`Move saga PENDING drain and terminal purge behind worker-owned SECURITY DEFINER functions.`)
**Reviewed diff:** `git diff origin/integration/storecore-int...def7d6a` (`9ff1392...def7d6a`), one commit, 12 files, +313 / −41
**No merge.** This file does not approve GitHub, does not call CI green, and does not authorize `/sdd.finish`.

## What was read

1. `sdd/wip/20260927-pos-integration-convergence/3-tasks/posc004-implementation-slices.md` — POSC-004 merged `#80`; POSC-004A ownership (worker-only role/functions, PENDING drain >60s, terminal purge 90d + tombstone ≥7y, runtime DELETE revocation with replacement); retry/poison inbox explicitly **not** invented (residual).
2. `sdd/wip/20260927-pos-integration-convergence/3-tasks/plan.md` §POSC-004A — SECURITY DEFINER worker/purge gate, advisory lock, tombstone-before-delete order, revoke runtime DELETE only with worker replacement; PIC-006A, POSC-005 wire, fiscal, live connector, and `/sdd.finish` remain separate gates.
3. Full `git diff origin/integration/storecore-int...HEAD` at `def7d6a`. Workspace branch matches reviewed SHA. Dirty paths outside the diff were not re-reviewed.
4. `sdd/STATUS.md`, `tasks.json`, and `4-implementation/progress.md` delta — tracking only; POSC-004 marked merged, 004A in progress, PIC-006A NO-GO until 004A merge.

## SDD why

POSC-004 closed commit/release/GET/reconcile on V13 without worker-owned purge. POSC-004A moves PENDING drain and terminal purge behind worker-owned `SECURITY DEFINER` functions, revokes runtime `DELETE` on saga/lines and tombstone DML, and schedules stale-PENDING drain alongside existing expiry/purge workers. Retry/poison inbox stays a documented residual — not invented here. STATUS still refuses fiscal/ARCA, live BlackStore companion, production module activation, tag, deploy, publish, and `/sdd.finish`. PIC-006A RO proxy and POSC-005 wire closure remain blocked on this merge.

## Diff judged

```text
backend/src/main/kotlin/com/storecore/blackstore/JdbcBlackStoreSagaEngine.kt
backend/src/main/kotlin/com/storecore/blackstore/application/BlackStoreIntegrationService.kt
backend/src/main/kotlin/com/storecore/blackstore/application/port/BlackStoreSagaPort.kt
backend/src/main/kotlin/com/storecore/blackstore/infrastructure/BlackStoreExpiryWorker.kt
backend/src/main/resources/db/migration/V14__posc004a_worker_purge.sql
backend/src/test/kotlin/com/storecore/blackstore/BlackStoreIntegrationServiceTest.kt
backend/src/test/kotlin/com/storecore/blackstore/Posc002fAcceptanceMatrixTest.kt
backend/src/test/kotlin/com/storecore/blackstore/Posc004aWorkerPurgeTest.kt
sdd/STATUS.md
sdd/wip/20260927-pos-integration-convergence/3-tasks/posc004-implementation-slices.md
sdd/wip/20260927-pos-integration-convergence/3-tasks/tasks.json
sdd/wip/20260927-pos-integration-convergence/4-implementation/progress.md
```

One commit `def7d6a`. No `frontend/`, OpenAPI, `.github`, fiscal, ML projection, PIC-006A proxy, POSC-005 wire, `INSERT(variant_id)` grant, or production config activation path.

## Scope checks

| Check | Result |
| --- | --- |
| V14 worker-owned SECURITY DEFINER drain + purge | PASS. `storecore_blackstore_worker_owner` NOLOGIN; `storecore_blackstore_delete_stale_pending()` and `storecore_blackstore_purge_terminal(...)` owned by worker role; `SET search_path TO pg_catalog, pg_temp`. |
| Runtime DELETE revoked with replacement | PASS. V14 `REVOKE DELETE` on `blackstore_integration_operations` and `blackstore_integration_reservation_lines`; `REVOKE INSERT, UPDATE, DELETE` on tombstones; `GRANT EXECUTE` on both functions to `storecore_runtime`. Engine routes drain/purge through `SELECT` of those functions. |
| PENDING drain >60s | PASS. SQL deletes `state='PENDING' AND receipt IS NULL AND created_at < now()-60s`; `deleteStalePending()` on port/engine; `@Scheduled` `drainStalePending()` in `BlackStoreExpiryWorker`. |
| Terminal purge 90d + tombstone ≥7y | PASS. Function rejects `RETENTION_ACTIVE` when `updated_at` within 90 days; inserts tombstone with `retention_until = now()+7 years`; deletes lines then saga. `purgeDue` batch unchanged in selection logic. |
| Does not edit V1–V13 | PASS. New `V14__posc004a_worker_purge.sql` only; comment and Flyway history assert version 14. |
| Scheduled worker wiring | PASS. `BlackStoreIntegrationService.drainStalePending()` gated like existing worker paths; worker adds `pending-drain-interval-ms` schedule (default 30s). |
| PG16 ACL + behavior tests | PASS. New `Posc004aWorkerPurgeTest` pins V14 SHA, asserts runtime lacks DELETE/INSERT tombstone, function EXECUTE grants, drain removes stale PENDING, purge respects retention then tombstones without touching ledger. Matrix test extends Flyway upgrade to V14. |
| SDD tracking only | PASS. STATUS/slices/tasks/progress updated for 004 merged and 004A in progress; no archive, no `/sdd.finish`, no PIC-006A or 005 closure. |
| Retry/poison inbox not invented | PASS. No retry table, inbox, CAS, or quarantine DDL/code. Slices document residual explicitly. |
| PIC-006A RO proxy | PASS — absent. No `@Transactional(readOnly)` proxy tests or GET/reconcile certification changes. |
| Fiscal / ML live / frontend / 005 wire | PASS — absent. Backend BlackStore worker slice only. |
| Production BLACKSTORE activation | PASS — absent. V14 header states no activation; test fixture activates module temporarily for PG16 (same pattern as prior POS harness tests), not a production config path. |
| Runtime `INSERT(variant_id)` grant | PASS — absent. No migration or grant change on `inventory_balances`; test seed uses superuser JDBC for fixtures only. |

## Validations

| Check | Result |
| --- | --- |
| Diff name-only and commit list | PASS, 2026-09-30. Twelve paths above; merge-base `origin/integration/storecore-int` = `9ff1392`; one commit `def7d6a`. |
| Maven PG16 (Posc004aWorkerPurgeTest, BlackStoreSagaEngineTest, BlackStoreIntegrationServiceTest) | **Recorded by Luna, exit 0.** Not re-run in this review (instruction: do not start Maven). |
| GitHub Verify | **Not CI green.** PR not opened at review time; hosted Verify not claimed. |

## Standards

Hexagonal BlackStore layout preserved: port adds `deleteStalePending()`; service exposes worker entrypoint; engine delegates destructive DML to DB functions; worker schedules alongside expiry/purge. Closed-domain error mapping via `translateWorker()` on SQL exceptions. No frontend or OpenAPI surface change.

SECURITY DEFINER surface is scoped: two functions, narrow grants to worker owner, EXECUTE-only for runtime, explicit search_path hardening. Matches plan gate for ACL review before privilege migration.

## Gaps

No scope breach. Documented residuals remain honest: retry/poison inbox (task title mentions it; slices defer implementation), WEB/PIC/commit/expire/purge race matrix beyond the single PG16 acceptance test, and PIC-006A certification. Those belong to SDD/implementation lanes or follow-on gates, not this diff.

## Residual NO-GO

PIC-006A RO proxy, retry/poison inbox, fiscal/ARCA, ML live/TASK-DSP-000B, production BlackStore companion, runtime `INSERT(variant_id)`, POSC-005 wire closure, tag, deploy, publish, and `/sdd.finish` stay outside this PR. This verdict is scope only. No merge. No GitHub approve. No CI green. No `/sdd.finish`.
