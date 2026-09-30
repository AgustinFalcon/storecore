VERDICT: APPROVED

# Grok 4.7 — local-suite admin coexistence (SCOPE lane)

**Date:** 2026-09-30
**Lane:** SCOPE
**Feature:** test-only local-suite coexistence after DSP-000B and POSC-002 Tx-C
**Branch:** `feature/local-suite-admin-coexistence`
**Committed head:** `9ee37d774451a87a24ecc65d56a9424114ae541a` (TASK-DSP-R01/R02, merge #93)
**Reviewed against:** working tree `git diff origin/integration/storecore-int` (no extra commits)
**PR:** none
**No merge.** This file does not approve GitHub, CI, `master`, the dispatcher, or live BlackStore. It does not authorize deploy, tag, push, secrets, or `/sdd.finish`.

## What was read

1. `AGENTS.md`, `sdd/STATUS.md` (Flyway ceiling V18, next free V19 with no file, no dispatcher, no `sdd.finish`, no ML/BlackStore activation), `sdd/PATTERNS.md` (capability state is closed; POS/BlackStore stays outside the core connector).
2. Full working-tree diff vs `origin/integration/storecore-int`.
3. Installed boundaries, not edited by this diff: `V8__posc002_shared_capability_cutover.sql` (`capability_tx_c_execute` aborts `BLACKSTORE_INTEGRATION`; EXECUTE of Tx-C is only `storecore_capability_admin`; runtime lost V3 EXECUTE and lost INSERT/UPDATE/DELETE on `module_configurations`), `V15__dsp000b_ml_sync_capability_guard.sql` (`capability_admin_change_configuration` raises `CAPABILITY_ML_GENERIC_DENIED` for `MARKETPLACE_ML` and is not re-granted to runtime), `JdbcCapabilityService.changeState` / `admit` (intent insert requires `session_id`; commit needs the admin pool; an aborted BlackStore command becomes `CapabilityConfigInvalid`).
4. Existing fixture `BlackStoreHttpContractTest.activate` (temporary `UPDATE module_configurations` for `BLACKSTORE_INTEGRATION`).
5. Call sites: `CommerceHttpIntegrationTest` and `InboxApplicationWorkerTest` use the Testcontainers superuser datasource, not `storecore_capability_admin`. `Posc002eGuardAclTest.jdbc` uses the same superuser. Neither HTTP class wires an admin pool.

## SDD why

Local commerce and inbox tests still need `MARKETPLACE_ML` in `ACTIVE` so `decide` can read the V15 snapshot. DSP-000B made the generic V3 function refuse that module, so those tests cannot keep calling `capability_admin_change_configuration` for it. They also have no capability-admin pool, so they cannot open a live admin session and call Tx-C.

002E/002F need a temporary BlackStore state for guard and loopback assertions. Tx-C aborts `BLACKSTORE_INTEGRATION` before it writes state. The previous helper built `InternalUserPrincipal(UUID.randomUUID(), …)` and called `JdbcCapabilityService.changeState`, which inserts `capability_admin_intents.session_id` for a session that was never stored, then fails closed (missing admin pool, and BlackStore abort even if a pool existed). The suite already has the allowed fixture: a superuser `UPDATE` scoped to `INSTALLATION` / `DEFAULT`, same statement family as `BlackStoreHttpContractTest`.

## Diff judged

Six paths, +34 / −26. No `src/main`. No `db/migration`. No OpenAPI, workflow, or frontend path.

```text
CHANGELOG.md
backend/src/test/kotlin/com/storecore/blackstore/Posc002eGuardAclTest.kt
backend/src/test/kotlin/com/storecore/blackstore/Posc002fHttpLoopbackTest.kt
backend/src/test/kotlin/com/storecore/commerce/CommerceHttpIntegrationTest.kt
backend/src/test/kotlin/com/storecore/commerce/InboxApplicationWorkerTest.kt
backend/src/test/kotlin/com/storecore/configuration/CapabilityAdminTestSupport.kt
```

`activateMarketplaceMl` updates only `state`, `config_version`, `updated_by`, and `updated_at` on `MARKETPLACE_ML` / `INSTALLATION` / `DEFAULT`. It does not change `config`, secrets, or outbox rows. Commerce and inbox call it only when `module == "MARKETPLACE_ML"` and return before the existing V3 `SELECT capability_admin_change_configuration(...)`. Other modules still use that pre-existing test call. This diff does not `GRANT` or `CREATE OR REPLACE` that function.

`setBlackStoreStateForTest` takes `CapabilityState` and writes `state.name` with `config_version=config_version+1` on `BLACKSTORE_INTEGRATION` / `INSTALLATION` / `DEFAULT`. 002E and 002F both pass the admin user id, so `updated_by` is that id. `COALESCE(?, updated_by)` is the only text difference from `BlackStoreHttpContractTest`; with the actor present the row matches that fixture. The helpers no longer call `changeState`, so they no longer insert an intent with a random `session_id`. 002F drops the unused `JdbcCapabilityService` injection. Restore-to-`DISABLED` call sites in both classes stay.

`CHANGELOG.md` records the local fixture and adds the already-landed merge link for #93. It does not say CI is green, and it does not close a WIP.

## P0 boundaries

| Boundary | Result |
| --- | --- |
| Dispatcher / `SENT` | Absent from the diff. |
| Live ML OAuth | Absent. The fixture does not write tokens, `oauth_secret_reference`, or a remote client. |
| Flyway V19 | Absent. Migration directory is untouched. Ceiling stays V18. |
| BlackStore live caller | Absent. State change is the existing test `UPDATE`, not a connector. |
| `GRANT INSERT(variant_id)` | Absent. No `GRANT`. |
| Claimed CI green | Not claimed. Changelog and this note keep hosted CI unverified. |
| `sdd.finish` | Not run. Not authorized. |
| Reopening V3 `EXECUTE` for `MARKETPLACE_ML` | Not reopened. ML returns before the V3 call. V15 still raises `CAPABILITY_ML_GENERIC_DENIED`. No `GRANT EXECUTE`. |

## Scope checks

| Check | Result |
| --- | --- |
| Test-only product delta | PASS. Five files under `backend/src/test`. Changelog is the only non-test path. |
| HTTP tests have no admin pool | PASS. Commerce and inbox `JdbcTemplate` is the container superuser. Tx-C stays granted to `storecore_capability_admin` only. |
| ML activation is a fixture, not the denied V3 function | PASS. Early return plus `activateMarketplaceMl`. |
| 002E/002F do not insert fake `session_id` intents | PASS. `JdbcCapabilityService.changeState` removed from both `activate` helpers. |
| BlackStore SQL matches the HTTP contract fixture | PASS for the executed path (module, scope, version bump, actor). Tx-C is not used, so the abort-on-BlackStore path stays intact. |
| Temporary state, not a new runtime privilege | PASS. Superuser `UPDATE` in tests does not grant `storecore_runtime` write on `module_configurations`. |
| Closed state at the BlackStore helper boundary | PASS. `CapabilityState` in, `state.name` on the wire. |

## Validations

| Check | Result |
| --- | --- |
| `git diff --check origin/integration/storecore-int` | Exit 0, run in this lane. |
| Focused Maven (four classes) | Not started here. Luna reported exit 0. That is a local run, not hosted CI, and this verdict does not treat it as CI green. |

## Gaps

No new scope gap. No requested change.
