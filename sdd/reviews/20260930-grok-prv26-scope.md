VERDICT: APPROVED

# Grok 4.7 — TASK-DSP-000B scope / implementation

**Lane:** SCOPE / implementation
**Task:** TASK-DSP-000B — snapshot ML SYNC capability guard
**GitHub base:** `origin/integration/storecore-int` @ `d4137fb` (POSC-005 merge #83)
**Branch:** `feature/dsp000b-ml-capability-guard` @ `a2950d1` (`Add V15 ML SYNC capability snapshot for TASK-DSP-000B.`)
**Reviewed diff:** `git diff origin/integration/storecore-int...HEAD` (`d4137fb...a2950d1`), one commit, 11 files, +498 / −41
**No merge.** This file does not approve GitHub, does not call CI green, does not authorize live ML, dispatcher, fiscal, or `/sdd.finish`.

## What was read (in order)

1. `sdd/wip/20260924-ml-desired-stock-projection/3-tasks/tasks.json` — TASK-DSP-000B acceptance (V15 additive; runtime snapshot; V3 generic closed for ML; decide shares transaction/snapshot; admin ML guard before config/switch).
2. `sdd/wip/20260924-ml-desired-stock-projection/3-tasks/dsp000b-implementation-slices.md` — slice scope, fuera, Luna Maven attestation, V15 SHA pin.
3. Full `git diff origin/integration/storecore-int...HEAD` at `a2950d1`.
4. `backend/src/main/resources/db/migration/V15__dsp000b_ml_sync_capability_guard.sql` in full; cross-read V8 `capability_tx_c_execute` lock order (action → config → switches).
5. `backend/src/main/kotlin/com/storecore/configuration/infrastructure/JdbcCapabilityService.kt` — `decide` / `decideMarketplaceMlSync`.
6. `backend/src/test/kotlin/com/storecore/commerce/Dsp000bMlCapabilityGuardTest.kt` in full.
7. SDD tracking delta: `sdd/STATUS.md`, `progress.md`, `CHANGELOG.md`, `Posc002fAcceptanceMatrixTest.kt` Flyway ceiling bump.

## SDD why

TASK-DSP-000B closes the ML capability guard gate before DSP-001+. Emission callers (`decide("MARKETPLACE_ML","SYNC",…)`) must read action/config/kill under PG16 share locks without granting runtime direct DML on capability tables. Generic V3 admin must not mutate ML; durable admin stays on Tx-C (V8) with action `FOR UPDATE` first. Module remains DISABLED outside tests; no dispatcher, network, secrets, or BlackStore live. STATUS and slices keep fiscal, `/sdd.finish`, and ML live NO-GO.

## Diff judged

```text
CHANGELOG.md
backend/src/main/kotlin/com/storecore/configuration/infrastructure/JdbcCapabilityService.kt
backend/src/main/resources/db/migration/V15__dsp000b_ml_sync_capability_guard.sql
backend/src/test/kotlin/com/storecore/blackstore/Posc002fAcceptanceMatrixTest.kt
backend/src/test/kotlin/com/storecore/commerce/Dsp000bMlCapabilityGuardTest.kt
sdd/STATUS.md
sdd/wip/20260924-ml-desired-stock-projection/3-tasks/dsp000b-implementation-slices.md
sdd/wip/20260924-ml-desired-stock-projection/3-tasks/tasks.json
sdd/wip/20260924-ml-desired-stock-projection/4-implementation/progress.md
sdd/wip/20260927-pos-integration-convergence/3-tasks/tasks.json
sdd/wip/20260927-pos-integration-convergence/4-implementation/progress.md
```

Production touch: **V15 only** + **`JdbcCapabilityService.decide`**. No frontend, OpenAPI, pom, `.github`, companion/POS guards, dispatcher, or activation wiring.

## Scope checks

| Check | Result |
| --- | --- |
| V3/V7 files untouched; next free Flyway V15 | PASS. New file `V15__dsp000b_ml_sync_capability_guard.sql`; V1–V14 files unedited. Test pins ceiling `15` and SHA `4CECD8B7E846E692B025F383CCFB8E7152716B4C93EB5B5945282FA15C8DBC61`. |
| `marketplace_ml_sync_snapshot()` SECURITY DEFINER, dedicated NOLOGIN owner | PASS. Role `storecore_ml_sync_guard_owner`; `ALTER FUNCTION … OWNER TO storecore_ml_sync_guard_owner`. |
| `search_path` fixed `pg_catalog, pg_temp` | PASS. Line 20 on snapshot function. |
| Constant pair MARKETPLACE_ML/SYNC (no module parameter) | PASS. All SQL literals; comment documents no arbitrary module argument. |
| Lock order action → config → switches (`FOR SHARE`) | PASS. Lines 35–38 action, 51–54 config, 62–69 switches; matches Tx-C ordering (V8 lines 252–254) with compatible share vs update semantics. |
| EXECUTE snapshot to runtime only | PASS. `REVOKE ALL … FROM PUBLIC`; `GRANT EXECUTE … TO storecore_runtime`. |
| V3 functions deny ML before config/switch locks | PASS. All four `capability_admin_*` raise `CAPABILITY_ML_GENERIC_DENIED` when `p_module='MARKETPLACE_ML'` (change/create) or `old_row.module_code='MARKETPLACE_ML'` (remove/replace) **before** `FOR UPDATE` on config/switches. |
| V3 EXECUTE revoked from PUBLIC/runtime | PASS. V8 already revoked; V15 re-asserts `REVOKE ALL … FROM PUBLIC, storecore_runtime` on all four V3 functions. Test asserts runtime lacks `has_function_privilege` on `capability_admin_change_configuration`. |
| Runtime no direct UPDATE on capability tables | PASS. Test login via `storecore_runtime` grant: `has_table_privilege(…,'UPDATE')` false; direct `UPDATE module_configurations` throws `PSQLException`. |
| `decide` SYNC uses snapshot inside REPEATABLE_READ | PASS. `@Transactional(isolation = REPEATABLE_READ)` on `decide`; early branch calls `marketplace_ml_sync_snapshot()` then applies state/kill/actor rules from JSON photo. Other modules unchanged. |
| Fail-closed on guard errors | PASS. Snapshot raises `ML_SYNC_GUARD_DENIED`; `mapSnapshotError` → `CapabilityActionNotAllowed`. V3 ML → `CAPABILITY_ML_GENERIC_DENIED`. Default ML seed DISABLED → `CapabilityDisabled` in test. |
| Runtime login snapshot + deny UPDATE + deny V3 ML | PASS. `runtimeSnapshotWorksAndDirectDmlAndV3MlAreDenied`. |
| decide Disabled → Tx-C ACTIVE → restore DISABLED | PASS. `decideUsesSnapshotAndTxCAdminStillActivatesMl` via `changeState` / Tx-C; restores DISABLED; `BLACKSTORE_INTEGRATION` stays DISABLED. |
| Concurrent FOR UPDATE waits on snapshot share lock | PASS. `concurrentWriterWaitsOnRuntimeSnapshotShareLock`: holder open txn calls snapshot; writer `FOR UPDATE` on action hits `lock_timeout`. |
| No production activation / live ML | PASS. No enable flags, secrets, HTTP ML caller, or dispatcher. Test-only Tx-C state flip with restore. |
| Scope limited to V15 + decide + tests + SDD | PASS. No out-of-scope production/Flyway beyond listed paths. |

## Validations

| Check | Result |
| --- | --- |
| Diff name-only and commit list | PASS, 2026-09-30. One commit `a2950d1`; merge-base `d4137fb`. |
| Maven PG16 (`Dsp000bMlCapabilityGuardTest`, `CapabilityTask003Test`) | **Luna attestation** in `dsp000b-implementation-slices.md`: exit 0, PG16 Testcontainers, V15 SHA verified. **Not re-run by this reviewer** (instruction 6). Not CI green. |
| GitHub / hosted Verify | **Not CI green.** Not evaluated as pass. |

## Standards

V15 follows established POS/ML migration style: dedicated NOLOGIN owner, `SECURITY DEFINER`, fixed `search_path`, explicit `public.` qualification, fail-closed exceptions. Kotlin branch mirrors existing `decide` state/kill/actor matrix for SYNC only; closed-domain `CapabilityState` / `CapabilityActionKind` preserved. Test harness matches `CapabilityAdminTestSupport` PG16 pattern used by POSC-002 family.

## Gaps

Non-blocking (P1/P2):

- **P1:** Acceptance text mentions “rutinas administrativas ML action-aware”; slice honestly defers durable admin to pre-existing Tx-C (action `FOR UPDATE` first) rather than new ML-specific SQL routines. Behavior is covered by `decideUsesSnapshotAndTxCAdminStillActivatesMl`; document as intentional deferral, not missing P0 guard.
- **P1:** V3 kill create/replace/remove ML denial is implemented in V15 but only `capability_admin_change_configuration` is exercised in tests.
- **P2:** `mapSnapshotError` both branches return `CapabilityActionNotAllowed()` (redundant ternary).
- **P2:** `tasks.json` lists test path under `configuration/`; test lives in `commerce/` (organizational only).
- **P2:** `storecore_ml_sync_guard_owner` receives `UPDATE` on capability tables though snapshot body is read-only; privilege wider than necessary, not exercised by function body.

## Residual NO-GO (not 000B P0)

- DSP-001..008, dispatcher, ML network/OAuth, secrets.
- BlackStore live companion, fiscal/ARCA, production ML activation.
- Runtime `INSERT(variant_id)` false (POSC residual).
- Full backend suite not re-run on this branch.
- Hosted Verify `steps=[]` is not CI green.
- `/sdd.finish` for ML WIP.

## P0 / P1

**P0:** none.

**P1:** ML admin action-aware routines deferred to Tx-C (documented); extend tests to V3 kill-switch ML denial when convenient. Neither blocks merge of this slice.
