VERDICT: APPROVED

# Grok 4.7 — POSC-002G scope/ACL review (SCOPE lane)

**Date:** 2026-09-30  
**Lane:** SCOPE  
**Feature:** POSC-002G — rollout y transferencia (docs-only runbook)  
**Branch:** `feature/posc002g-rollout` @ `bfdfb88` (`origin/integration/storecore-int`) plus **uncommitted working-tree delta**  
**PR:** none yet  
**Integration head (committed):** `bfdfb88` (merge POSC-002F, PR #70)  
**Reviewed against:** `sdd/wip/20260927-pos-integration-convergence/3-tasks/posc002-implementation-slices.md` (POSC-002G + residuals 002B/002C), `AGENTS.md`  
**No merge.** This file does not approve GitHub, does not call CI green, does not authorize deploy/tag/push, and does not authorize `/sdd.finish`.

## What was read

1. `AGENTS.md`, POSC-002G slice ownership/acceptance and local status line (runbook only; residuals 002B HTTP/Tx-S and 002C admin HTTP/provider).
2. Prior SCOPE format: `sdd/reviews/20260930-grok-prv12-scope.md`.
3. Full runbook `sdd/wip/20260927-pos-integration-convergence/4-implementation/posc002g-rollout-runbook.md`.
4. Full working-tree SDD delta: `sdd/STATUS.md`, `posc002-implementation-slices.md`, `tasks.json`, `progress.md`.
5. Installed SQL/HTTP residuals spot-checked at integration head (not re-implemented in this delta).

## SDD why (002G)

Docs-only transfer after 002F merge. Must document single-VM rollout for the V8–V10 + bearer + guards delta already on `integration/storecore-int`, without activating `BLACKSTORE_INTEGRATION`, without claiming hosted CI green, and without closing TASK-POSC-002 or unblocking POSC-003 while 002B/002C HTTP/provider residuals remain open.

## Scope checklist

| Requirement | Docs | Code (head) | Result |
| --- | --- | --- | --- |
| Docs-only; no `backend/src/main/`, Flyway, or OpenAPI edits in working tree | PASS | PASS — diff is SDD + untracked runbook only | PASS |
| Runbook does not authorize BLACKSTORE activation | PASS | PASS — `DISABLED` post-migrate; test-only activation called out | PASS |
| Does not claim CI / Verify green | PASS | PASS — explicit “Verify alojado no se interpreta como CI verde” | PASS |
| Does not close POSC-002 or unblock POSC-003 | PASS | PASS — `tasks.json` keeps POSC-003 `blocked_by_predecessor_gate` | PASS |
| Admin pools/provider documented as **not implemented** | PASS | PASS — `application.yml` has single runtime DS only | PASS |
| V3 REVOKE + adapter still on V3 firmas honestly recorded | PASS | PASS — V8 REVOKE; `JdbcCapabilityService` calls four V3 functions | PASS |
| Tx-C SQL exists; adapter lacks `capability_tx_c_execute` | PASS | PASS — V8 functions; no match in `JdbcCapabilityService` | PASS |
| No `CompanionAdminController`; nine companion SQL entry points on admin role only | PASS | PASS — repo-wide grep; V9 GRANT to `storecore_companion_admin` | PASS |
| POS guards EXECUTE runtime only | PASS | PASS — V10 GRANT `pos_companion_*` to `storecore_runtime` | PASS |
| Correlation server fallback residual documented | PASS | PASS — `CapabilityController.changeState` uses `correlationId ?: UUID.randomUUID()` | PASS |
| Operator HTTP not invented for kill/revoke/PENDING | PASS | PASS — table separates 002E/002F test evidence from “Operador hoy” gaps | PASS |
| Checksums V3–V9 match 002F matrix pins | PASS | PASS — identical hex in runbook and `Posc002fAcceptanceMatrixTest` | PASS |
| ML RR and `INSERT(variant_id)` stay explicit residuals | PASS | PASS — runbook + slices; 002F asserts INSERT=false | PASS |

## Recorded validation (not CI)

| Run | Command / scope | Result | Timestamp |
| --- | --- | --- | --- |
| 1 | `git status` + `git diff --stat` | 4 SDD files modified; untracked `posc002g-rollout-runbook.md`; zero paths under `backend/src/main/` | 2026-09-30T00:21-03:00 |
| 2 | `git rev-parse origin/integration/storecore-int` | `bfdfb88aa2197e23016d7c1d00b850b2765fd332` | 2026-09-30T00:21-03:00 |
| 3 | `rg CompanionAdminController` (repo) | no matches | 2026-09-30T00:21-03:00 |
| 4 | `rg capability_tx_c_execute backend/src/main/kotlin/.../JdbcCapabilityService.kt` | no matches | 2026-09-30T00:21-03:00 |

No Maven run in this review lane (002F matrix already recorded 8/8 local PG16 tests; hosted CI not green).

## Fact checks (installed head vs runbook claims)

- **V8:** `REVOKE ALL` on four `capability_admin_*` V3 functions from `PUBLIC` and `storecore_runtime`; `GRANT EXECUTE` on `capability_tx_c_execute/status/abort` to `storecore_capability_admin` only — matches runbook §“Qué queda instalado”.
- **V9:** nine `companion_admin_*` functions `REVOKE` from `PUBLIC`/`storecore_runtime`; `GRANT EXECUTE` to `storecore_companion_admin` only — matches runbook.
- **V10:** `pos_companion_effect_guard` / `pos_companion_read_guard` `GRANT EXECUTE` to `storecore_runtime`; revoked from admin roles — matches runbook.
- **HTTP adapter:** `JdbcCapabilityService` still invokes `capability_admin_change_configuration`, `create_kill_switch`, `remove_kill_switch`, `replace_kill_switch` — runbook correctly labels this 002B residual, not an operator procedure.
- **Correlation:** only `changeState` retains optional client correlation with server `UUID.randomUUID()` fallback (line 43 `CapabilityController.kt`); kill routes require non-null `correlationId` — runbook transfer section targets the correct residual.
- **Config:** `application.yml` declares one runtime datasource; no capability-admin or companion-admin pool — matches runbook §“Provider y pools admin (por referencia, no implementados)”.
- **PR/SHA table:** aligns with `sdd/STATUS.md`, slices, and `progress.md` at `bfdfb88`.

## Findings (SCOPE lane)

### P0 — none

No scope breach: working tree is documentation-only; runbook does not invent implemented admin HTTP, pools, or provider; does not unlock POSC-003 or close POSC-002.

### P1 — informational (non-blocking)

- **Future internal route names** (`/internal/admin/blackstore-companion/*`) appear as reference targets for 002C — clearly marked “Cuando existan”; not presented as shipped endpoints.
- **V1/V2/V10 file SHA-256** deliberately unpinned in runbook (defer to `flyway_schema_history` + integration tree) while V3–V9 carry 002F pins — honest and consistent with matrix scope.
- **Kill HTTP routes exist** but runbook warns they call V3 signatures revoked from runtime — operators must not treat them as production kill/revoke procedures until 002B ships Tx-S + admin pool + `capability_tx_c_execute`.

### P2 — informational

- Runbook could later add a one-line pointer that PG16 acceptance tests call V3 functions with elevated test credentials (not operator playbook) — optional clarity; not a factual error today.
- SDD traceability updates (`tasks.json` 002G → `local_implemented_pending_dual_review`) are consistent; merge still requires dual Grok 4.7 + SDD lane review per repo rules.

## Residual gates (out of 002G SCOPE lane)

- POSC-002B HTTP/Tx-S: durable intent, mandatory client correlation (remove server fallback), capability-admin pool, wire `capability_tx_c_execute`.
- POSC-002C HTTP/provider: nine companion admin entry points + CSRF + installation secret provider.
- `INSERT(variant_id)` on `inventory_balances` for runtime — still false.
- ML REPEATABLE READ admin-wins (`TASK-DSP-000B`) — separate NO-GO.
- POSC-003+ catalog/reserve port, POSC-004/004A, PIC-006A, live connector, fiscal, `/sdd.finish` — own gates unchanged.

## Summary

POSC-002G SCOPE lane **APPROVED**. The runbook is docs-only, factually aligned with V8–V10 SQL grants/revokes and the open HTTP/adapter residuals at `bfdfb88`, honestly separates test evidence from operator capability, refuses BLACKSTORE activation and CI-green claims, and explicitly withholds POSC-003 dependency satisfaction. This verdict is scope-only — no merge, no GitHub approve, no `/sdd.finish`.
