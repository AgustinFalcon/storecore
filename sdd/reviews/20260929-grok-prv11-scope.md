VERDICT: APPROVED

# Grok 4.7 — POSC-002E scope/ACL review (SCOPE lane)

**Date:** 2026-09-29  
**Lane:** SCOPE  
**Feature:** POSC-002E — guard transaccional en engine y lecturas  
**Branch:** `feature/posc002e-pos-guards` @ `d4a3a36` (integration head) plus **uncommitted working-tree delta**  
**PR:** none yet  
**Integration head (committed):** `d4a3a36` (`Merge pull request #68 … POSC-002D bearer HTTP`)  
**Reviewed against:** `sdd/wip/20260927-pos-integration-convergence/3-tasks/posc002-implementation-slices.md` (POSC-002E), `sdd/wip/20260927-pos-integration-convergence/2-technical/posc002-identity-acl-proposal.md` (guard/lock/isolation, GET ownership)  
**No merge.** This file does not approve GitHub, does not call CI green, does not authorize deploy/tag/push, and does not authorize `/sdd.finish`.

## What was read

1. `AGENTS.md`, POSC-002E slice ownership/acceptance, guard proposal § Barrera de concurrencia / Port SQL / GET-reconcile.
2. Prior SCOPE format: `sdd/reviews/20260929-grok-prv10-scope.md`.
3. Full working-tree delta: `V10__posc002e_companion_guards.sql`, `PosCompanionGuardPort`, `JdbcPosCompanionGuard`, `JdbcBlackStoreSagaEngine` (RC/RR templates, guard-first, ownership filter, worker paths), `BlackStoreIntegrationService` / controller principal wiring, `Posc002eGuardAclTest`, `BlackStoreSagaEngineTest` (ownership + tombstone 410).
4. Confirmed **no edits** to Flyway V1–V9 scripts; V10 only additive.

## SDD why (002E)

POSC-002E closes the gap between HTTP bearer auth (002D) and durable saga effects: SQL `pos_companion_effect_guard` / `pos_companion_read_guard` enforce action→config→switch→companion→credential under correct isolation, `VerifiedCompanionPrincipal` flows through every mutating and read saga port call, and GET/reconcile fail-closed on foreign ownership without cross-client tombstone leakage. Workers (`expireDue`/`purgeDue`) remain system-scoped without companion principal.

## Scope checklist

| Requirement | Code | Tests | Result |
| --- | --- | --- | --- |
| `pos_companion_effect_guard` VOLATILE SECURITY DEFINER RC; whitelist actions; FOR SHARE action→config→switch→companion→credential; auth_ready/scopes/version | PASS | PASS — isolation 25000, scope 42501, DISABLED P0001, admin-wins/effect-wins | PASS |
| `pos_companion_read_guard` STABLE; no row locks; requires RR isolation | PASS | PASS — RR vs RC 25000 | PASS |
| Owner `storecore_pos_guard_owner` NOLOGIN; EXECUTE only `storecore_runtime`; column-minimal UPDATE grants for FOR SHARE | PASS | PASS — `ownerIsNologinAndExecuteIsNarrow` | PASS |
| No `GRANT ALL`; no V1–V9 edits; no BLACKSTORE activation in migration | PASS | PASS — checksums + DISABLED after V10 | PASS |
| Engine: guard first in tx; explicit RC mutating / RR read-only; no `decide()` inside saga tx | PASS | PASS — engine has zero `decide` refs | PASS |
| `expireDue`/`purgeDue`/`purge` without companion principal or guard | PASS | PASS — expiry/purgeDue tests | PASS |
| GET foreign → 404; reconcile foreign → unknownReceipts; same-client tombstone → 410 | PASS | PASS — `foreign get is 404…`, tombstone 410 | PASS |
| Fail-closed SQL mapping: P0001→CAPABILITY_DISABLED, 42501/25000→FORBIDDEN | PASS | PASS — SQL states + `JdbcPosCompanionGuard.translate` | PASS |

## Recorded validation (not CI)

| Run | Command / scope | Result | Timestamp |
| --- | --- | --- | --- |
| 1 | `mvn -Dtest="Posc002eGuardAclTest,BlackStoreSagaEngineTest" test` — **20 tests, 0 failures** (6 ACL + 14 saga) | BUILD SUCCESS | 2026-09-29T23:07:14-03:00 |

Local PG16 Testcontainers only — not GitHub CI green.

## Findings (SCOPE lane)

- **V10 guards match pinned lock/isolation contract:** effect path is VOLATILE DEFINER with RC gate, sequential FOR SHARE on action anchor→config→switches→companion→credential; read path is STABLE, lock-free, RR-gated; grants are EXECUTE-narrow to `storecore_runtime` with NOLOGIN owner and column-scoped UPDATE for share locks — no `GRANT ALL`, V1–V9 byte-stable, capability stays DISABLED post-migrate.
- **Engine wiring is fail-closed and principal-aware:** `TransactionTemplate` RC/RR split; `authorizeForEffect`/`authorizeForRead` are the first SQL in each tx; `decide()` remains only in `BlackStoreIntegrationService` pre-saga; workers call `mutateReserved`/`purge` with `principal=null` (no guard); foreign GET 404 and reconcile client filter prevent cross-companion reads; tombstone same-client returns 410.
- **Concurrency evidence is present:** PG16 two-connection tests demonstrate admin-wins (effect waits on action anchor, observes post-lock DISABLED → P0001) and effect-wins (admin FOR UPDATE waits on effect-held share locks).
- **Adapter mapping is strict:** `JdbcPosCompanionGuard` maps P0001→`BlackStoreCapabilityDisabled`, 42501/25000→`BlackStoreForbidden`; no alternate escape path in engine.
- **Informational (non-blocking):** effect guard’s global `capability_kill_switches … FOR SHARE` lock and `ORDER BY action_code` (module implicit) are acceptable in single-tenant POS install but should stay aligned if ML shared locks land in the same delta; reconcile’s nested `get()` re-invokes read guard within the joined RR tx (redundant, not unsafe).

## Residual gates (out of 002E SCOPE lane)

- POSC-002F full acceptance matrix, dual SDD lane review, HTTP regression bundle, merge to `integration/storecore-int`.
- Catalog/stock HTTP paths still use header binding without SQL read guard (pre-002E surface; saga GET/reconcile covered here).
- ML REPEATABLE READ admin-wins — separate NO-GO per proposal.

## Summary

POSC-002E SCOPE lane **APPROVED**. V10 SQL guards, engine isolation/principal transport, ownership semantics, worker bypass, and fail-closed mappings meet the pinned acceptance bar with recorded PG16 evidence. This verdict is scope-only — no merge, no GitHub approve, no `/sdd.finish`.
