VERDICT: APPROVED

# Grok 4.7 — POSC-002B HTTP/Tx-S scope review (SCOPE lane)

**Date:** 2026-09-30  
**Lane:** SCOPE  
**Feature:** POSC-002B — residual HTTP/Tx-S capability administration  
**Branch:** `feature/posc002b-capability-http` @ `a6f520b` (`origin/integration/storecore-int`) plus **uncommitted working-tree delta**  
**PR:** none yet  
**Integration head (committed):** `a6f520b` (merge POSC-002G, PR #71)  
**Reviewed against:** `sdd/wip/20260927-pos-integration-convergence/3-tasks/posc002-implementation-slices.md` (POSC-002B + residuals 002C), `AGENTS.md`  
**No merge.** This file does not approve GitHub, does not call CI green, does not authorize deploy/tag/push, and does not authorize `/sdd.finish`.

## What was read

1. `AGENTS.md`, POSC-002B slice ownership/acceptance and 002C residual boundary.
2. Prior SCOPE format: `sdd/reviews/20260930-grok-prv13-scope.md`.
3. Full working-tree delta vs `origin/integration/storecore-int`: 15 modified paths + 8 untracked files under `backend/src/main/kotlin/com/storecore/configuration/**` and matching tests/SDD.
4. Installed V8 SQL (`V8__posc002_shared_capability_cutover.sql`) for grants, runtime intent INSERT, admin Tx-C EXECUTE, and BLACKSTORE abort.
5. Spot-checks: `JdbcCapabilityService`, `CapabilityAdminCommandService`, `CapabilityController`, `CapabilityAdminDataSourceConfig`, `application.yml`, `CapabilityAdminOperation.fromWire`.

## SDD why (002B HTTP/Tx-S)

Close the open adapter residual after V8 merge: durable Tx-S on runtime (CSRF + intent INSERT), Tx-C on a separate capability-admin pool via `capability_tx_c_execute`, mandatory client correlation (remove server fallback), status/abort recovery routes, and fail-closed when the admin pool is absent. Must not re-expose V3 signatures to runtime, must not activate `BLACKSTORE_INTEGRATION` through Tx-C, must not implement 002C companion admin HTTP/provider, and must not unblock POSC-003 or close TASK-POSC-002.

## Scope checklist

| Requirement | Code / config | Result |
| --- | --- | --- |
| Adapter stops calling four V3 `capability_admin_*` functions | `JdbcCapabilityService` — no `SELECT capability_admin_*`; calls `capability_tx_c_execute/status/abort` via `CapabilityAdminJdbc` | PASS |
| Tx-S on runtime: CSRF verify, intent INSERT, CSRF rotate | `CapabilityAdminCommandService.admit` inside `TransactionTemplate`; runtime `jdbc.update` INSERT into `capability_admin_intents` | PASS |
| Tx-C on admin pool, **outside** runtime CSRF transaction | `commit` / `commandStatus` / `abortCommand` invoked after `TransactionTemplate.execute` returns; no `@Transactional` on admin mutation methods | PASS |
| Runtime INSERT on intents; admin EXECUTE Tx-C only | V8 `GRANT INSERT … TO storecore_runtime`; `GRANT EXECUTE ON capability_tx_c_* TO storecore_capability_admin`; test login `storecore_cap_admin_login` inherits `storecore_capability_admin`, not runtime | PASS |
| Admin pool separate from runtime login | `CapabilityAdminDataSourceConfig` gated on `storecore.capability-admin.datasource.url`; tests wire distinct username/password | PASS |
| `application.yml` runtime-only by default | Single `spring.datasource`; no `storecore.capability-admin` block | PASS |
| Missing admin pool fails closed, intent recoverable | `adminJdbc ?: throw CapabilityAdminPoolMissing()`; `Posc002bCapabilityTxsTest#adapterCallsTxCNotV3AndMissingPoolLeavesIntent` | PASS |
| Correlation mandatory; server fallback removed | `CapabilityController.changeState`: `correlationId ?: throw CapabilityCorrelationRequired()`; kill DTOs `@NotNull correlationId` | PASS |
| Status + abort internal routes | `GET /commands/{correlationId}`, `POST /commands/{correlationId}/abort` on `CapabilityController` | PASS |
| BLACKSTORE not activated via Tx-C | V8 `capability_tx_c_execute` abort branch for `BLACKSTORE_INTEGRATION`; adapter `interpret` → `CapabilityConfigInvalid`; PG16 test `blackstoreTxCAbortsAndFavoritesStayDisabled` | PASS |
| Closed operation type with Unknown at wire edge | `CapabilityAdminOperation.fromWire` → `Unknown`; `admit` rejects Unknown | PASS |
| No `CompanionAdminController` | Repo-wide grep: no matches | PASS |
| POSC-003 remains blocked | `tasks.json` `TASK-POSC-003` → `blocked_by_predecessor_gate` | PASS |
| 002C companion admin HTTP/provider not implemented | No new companion admin controller/routes; `InMemoryCompanionSecretProvider` unchanged in product path | PASS |
| Does not claim hosted CI green | Not asserted; Verify alojado exception unchanged in `sdd/STATUS.md` | PASS |

## Recorded validation (not CI)

| Run | Command / scope | Result | Timestamp |
| --- | --- | --- | --- |
| 1 | `git status` + `git diff --stat origin/integration/storecore-int` | 15 modified + 8 untracked; all delta under capability admin adapter/controller/tests + SDD traceability | 2026-09-30T00:36-03:00 |
| 2 | `git rev-parse HEAD origin/integration/storecore-int` | both `a6f520b33d22bbc02c68c046a989d1ff4106e28b` | 2026-09-30T00:36-03:00 |
| 3 | `rg capability_admin_change_configuration backend/src/main/kotlin/.../JdbcCapabilityService.kt` | no matches | 2026-09-30T00:36-03:00 |
| 4 | `rg capability_tx_c_execute backend/src/main/kotlin/.../JdbcCapabilityService.kt` | one match (admin pool call) | 2026-09-30T00:36-03:00 |
| 5 | `rg CompanionAdminController` (repo) | no matches | 2026-09-30T00:36-03:00 |
| 6 | `CapabilityAdminOperation.fromWire` inspection | `Unknown` case present | 2026-09-30T00:36-03:00 |
| 7 | Recorded local suites (prior run, not re-executed) | `Posc002bCapabilityAdminOperationTest` + `Posc002bCapabilityTxsTest` + `CapabilityTask003Test` BUILD SUCCESS; `IdentityHttpIntegrationTest#adminCanRemoveAndReplaceExpiredCapabilityKills` BUILD SUCCESS after open `CapabilityAdminDataSourceConfig` | recorded |

No Maven run in this review lane (suites above already recorded locally; hosted CI not green).

## Fact checks (delta vs slice)

- **Tx-S / Tx-C split:** `CapabilityAdminCommandService` wraps CSRF verification, intent admission, and CSRF rotation in `TransactionTemplate`; `commands.commit` runs on the next line with a separate `CapabilityAdminJdbc` connection. `@Transactional` removed from `JdbcCapabilityService` admin mutation methods so Tx-C cannot join the runtime CSRF transaction.
- **V3 retirement in adapter:** Four HTTP admin paths delegate to `CapabilityAdminCommand` + Tx-C; topology harness and 002F matrix assertions flipped to require Tx-C and forbid V3 SELECTs in `JdbcCapabilityService`.
- **Grants (V8):** Runtime may INSERT/SELECT intents; `storecore_capability_admin` (via dedicated login in tests) holds EXECUTE on `capability_tx_c_execute/status/abort`; V3 EXECUTE revoked from PUBLIC/runtime — matches slice.
- **Correlation:** Only `changeState` had optional correlation with server fallback at integration head; delta enforces client UUID on all four mutation routes.
- **BLACKSTORE:** Tx-C SQL hard-aborts; tests that need temporary ACTIVE (`BlackStoreHttpContractTest`, `BlackStoreSchemaMigrationTest`) use direct SQL UPDATE, not operator capability HTTP — consistent with “no activation via Tx-C”.
- **Production config:** Default YAML is runtime-only; without `storecore.capability-admin.datasource.*` bean is absent, admin mutations return `CAPABILITY_ADMIN_POOL_MISSING` (503) after intent is durably inserted — fail-closed per slice.
- **POSC-003 / TASK-POSC-002:** SDD updates mark 002B `http_txs_local_implemented_pending_dual_review`; TASK-POSC-002 and POSC-003 gates unchanged.

## Findings (SCOPE lane)

### P0 — none

No scope breach on the four automatic CHANGES_REQUIRED triggers: Tx-C is not inside the runtime CSRF transaction; V3 adapter calls are gone; admin pool is not the runtime login; POSC-003 is not unlocked.

### P1 — informational (non-blocking)

- **Production operator gap:** Admin HTTP remains non-operational until installation configures `storecore.capability-admin.datasource.*` with a `storecore_capability_admin` login — intentional fail-closed; 002G runbook already documents pools by reference.
- **Test fixture V3 calls:** Several integration tests (`IdentityHttpIntegrationTest`, commerce suites) still invoke `capability_admin_change_configuration` via superuser `JdbcTemplate` for setup only; not part of the product adapter surface.
- **HTTP race matrix:** Slice prose lists double-CSRF, crash Tx-S→Tx-C, and lost-response HTTP scenarios; current evidence is PG16-focused (`Posc002bCapabilityTxsTest`) plus `IdentityHttpIntegrationTest` kill HTTP happy path — core split is proven; full HTTP race catalog is thinner than acceptance prose (SDD lane may tighten).
- **002C still open:** Nine companion admin entry points, installation secret provider, and CSRF companion commands remain deferred — correctly out of this delta.

### P2 — informational

- `CapabilityStateRequest.correlationId` remains nullable in the DTO with controller-side enforcement; kill routes use stricter `@NotNull` — minor consistency nit only.
- SDD traceability (`tasks.json`, `posc002-implementation-slices.md`, `STATUS.md`) aligns with local implementation state; merge still requires dual Grok 4.7 (this SCOPE lane + SDD lane) per repo rules.

## Residual gates (out of 002B SCOPE lane)

- POSC-002C HTTP/provider: nine companion admin entry points + installation secret provider + internal USER ADMIN routes.
- Production capability-admin pool wiring per VM (configuration, not code in default YAML).
- `INSERT(variant_id)` on `inventory_balances` for runtime — still false.
- ML REPEATABLE READ admin-wins (`TASK-DSP-000B`) — separate NO-GO.
- POSC-003+ catalog/reserve port, POSC-004/004A, PIC-006A, live connector, fiscal, `/sdd.finish` — own gates unchanged.

## Summary

POSC-002B HTTP/Tx-S SCOPE lane **APPROVED**. The working-tree delta replaces V3 adapter calls with durable runtime intent admission plus admin-pool Tx-C, enforces client correlation, adds status/abort recovery routes, keeps default YAML runtime-only with fail-closed admin pool absence, preserves BLACKSTORE abort semantics, and does not unlock POSC-003 or implement 002C companion admin HTTP. This verdict is scope-only — no merge, no GitHub approve, no `/sdd.finish`.
