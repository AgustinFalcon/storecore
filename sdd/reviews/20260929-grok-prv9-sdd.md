VERDICT: APPROVED

# POSC-002C V9 companion ACL — independent SDD/code review (Grok 4.7 lane: SDD)

Date: 2026-09-29  
Branch: `feature/posc002c-companion-schema`  
HEAD: `20152b96a08b612d983727f8b3c72cb6fab51fec` (cut from `origin/integration/storecore-int`)  
Scope: **uncommitted changes only** — V9 SQL + PG16 tests; no HTTP, secret provider, POS guards, or Kotlin adapter in this slice.

## SDD why (PR-equivalent)

**Title:** POSC-002C first deliverable — companion schema + Tx-P/Tx-C admin SQL + PG16 tests

**Why:** Add companion credential metadata (`token_fingerprint`, `scopes`, `service_role`, `auth_ready`), durable admin command/audit tables, and nine `companion_admin_*` entry points that consume V8 `capability_admin_session_is_live_admin` + `p_live_session` — **without** activating `BLACKSTORE_INTEGRATION`, POS effect/read guards, HTTP routes, secret provider, or edits to V1–V8.

This slice is the authorized first deliverable of TASK-POSC-002C. Full 002C (companion admin pool, Kotlin port, HTTP, provider idempotency, race tests) and 002D–E remain open.

## What was read (required order)

1. `AGENTS.md`
2. `sdd/wip/20260927-pos-integration-convergence/3-tasks/posc002-implementation-slices.md` — POSC-002C section
3. `sdd/wip/20260927-pos-integration-convergence/2-technical/posc002-identity-acl-proposal.md` — companion admin, Tx-P, `auth_ready`, nine entry points, grants manifesto
4. Prior format: `sdd/reviews/20260929-grok-prv8-sdd.md`
5. Full V9 SQL: `backend/src/main/resources/db/migration/V9__posc002c_companion_admin.sql`
6. Full test: `backend/src/test/kotlin/com/storecore/blackstore/Posc002cCompanionAclTest.kt` (`Posc002cV9AclTest`)
7. Git scope: `git status` / `git diff` — V1–V8 tracked files unmodified

## Validations run (this review)

| Check | Result |
|---|---|
| `git status` / uncommitted scope | 2 untracked files only (`V9__posc002c_companion_admin.sql`, `Posc002cCompanionAclTest.kt`); **no V1–V8 edits** |
| `git diff` | Empty (no staged/unstaged changes to tracked files) |
| V3/V8 LF-normalized SHA-256 | Matches harness fingerprints in test (`Posc002cV9AclTest.kt:44-50`) |
| Maven focused suite (**recorded; not re-run**) | `mvn -Dtest=Posc002cV9AclTest test` → **Tests run: 6, Failures: 0, Errors: 0, BUILD SUCCESS**, 2026-09-29T22:12:04-03:00 |
| PostgreSQL | 16.14 (Testcontainers `postgres:16-alpine`) |
| Hosted CI | Not invoked; **not treated as CI green** |

## Findings

### P0 — none open in this SQL+test slice

No blocker within 002C first-deliverable ownership. Criteria checked: V1–V8 untouched, nine entry points present, `auth_ready` fail-closed on legacy upgrade, no secret/ref in status output, PUBLIC/runtime EXECUTE denied, no `BLACKSTORE_INTEGRATION` activation, no V8 intent CHECK extension, no `GRANT ALL` / `ALL SEQUENCES` revoke (correctly deferred to 002F).

### P1 — must close before TASK-POSC-002C / ship beyond SQL foundation

| ID | Finding | Evidence |
|---|---|---|
| P1-01 | **No companion admin pool, Kotlin port, HTTP routes, or secret provider** — SQL-only foundation; production commands require segregated datasource + adapter per proposal. | Out of slice; `posc002-implementation-slices.md` POSC-002C ownership |
| P1-02 | **`companion_admin_activate` does not gate on `auth_ready=TRUE`** on the active credential; only checks module `state='ACTIVE'`. Safe while `BLACKSTORE_INTEGRATION` stays DISABLED (tested), but if capability were enabled externally a legacy quarantined credential could reach companion ACTIVE without rotate. | `V9:431-433`; test `activateStaysFailClosed` only covers DISABLED module (`Posc002cV9AclTest.kt:175-180`) |
| P1-03 | **OPERATOR / inactive-user denial not exercised** — relies on V8 `capability_admin_session_is_live_admin` (`u.active AND r.code='ADMIN'`) but tests cover expired session and stranger actor only, not OPERATOR role or `users.active=FALSE`. | `V8:191-211`; `Posc002cV9AclTest.kt:105-121,206-211` |
| P1-04 | **No function-level READ COMMITTED guard** on companion admin Tx-C (same residual class as V8). Adapter/pool must pin isolation; add PG16 negative when HTTP lands. | `V9:289-451`; no `transaction_isolation` check in `prosrc` |
| P1-05 | **`companion_admin_suspend` not covered** in PG16 tests — function and grant exist; activate/revoke/rotate/pair paths are proven. | `V9:462-469`; no suspend invocation in test file |

### P2 — improve before closing 002C or 002F matrix

| ID | Finding | Evidence |
|---|---|---|
| P2-01 | **`companion_admin_allowed_scopes` whitelists `cost:read`** — acceptable for admin provisioning vocabulary, but 002D must enforce emission/denial policy (`includeCost=true` always denied to companion). | `V9:121-126` |
| P2-02 | **Registry ACL partial tighten only** — V9 revokes broad V5 runtime DML and re-grants column-narrow SELECT; full saga/cursor/`ALL SEQUENCES` matrix remains 002F. | `V9:535-538`; slice header L2 |
| P2-03 | **V1–V7 checksums not all pinned** in test (V3 + V8 only); git confirms no tracked edits — low risk. | `Posc002cV9AclTest.kt:44-50` |
| P2-04 | **No admin-wins/effect-wins or attach/execute race tests** — lock helper takes action→config→switch `FOR UPDATE` (`V9:148-154`) but concurrency not demonstrated; belongs to 002C close-out or 002F. | Out of first-cut scope |
| P2-05 | **Provider idempotency / discard / bearer-once** not testable without Kotlin secret port (002D). | `posc002-identity-acl-proposal.md` §Identidad de servicio |

## What the slice gets right (evidence-backed)

- **V1–V8 preserved:** only untracked V9 + test; V3/V8 SHA-256 pinned; populated V8→V9 upgrade preserves legacy credential ACTIVE + `auth_ready=FALSE` (`Posc002cV9AclTest.kt:51-63`).
- **Legacy fail-closed:** `auth_ready BOOLEAN NOT NULL DEFAULT FALSE` + CHECK pairs metadata only when ready (`V9:16-26`); no backfill of fingerprint/scopes on upgrade.
- **Nine entry points:** `prepare_command`, `attach_secret`, `command_status`, `abort_command`, `pair`, `activate`, `suspend`, `rotate`, `revoke` — EXECUTE granted only to `storecore_companion_admin` (`V9:510-518`); internal helpers (`apply_state`, `lock_shared_anchor`, digest/scopes) revoked from admin role (`V9:502-508`; test `rolesStayNologinAndExecuteIsNarrow`).
- **V8 session protocol consumed:** every public entry point calls `capability_admin_session_is_live_admin(p_actor, p_live_session)`; `p_live_session` is last arg; **no V8 intent CHECK edit** (V8 file unmodified).
- **Tx-P flow:** prepare → attach → pair with hash validation, idempotent replay, attach conflict on mismatched fingerprint/ref (`Posc002cV9AclTest.kt:125-152`).
- **No secret leak in status:** `command_status` returns metadata only; test asserts status map contains no `ref:synthetic` (`V9:241-259`; `Posc002cV9AclTest.kt:150-152`).
- **BLACKSTORE stays DISABLED:** pair leaves module DISABLED and companion DISABLED; activate aborts while module DISABLED (`Posc002cV9AclTest.kt:147-148,175-180`).
- **PUBLIC/runtime fail-closed:** runtime INSERT/EXECUTE and blank login denied; runtime narrow SELECT only, not `created_at` (`V9:496-508,535-538`; `Posc002cV9AclTest.kt:83-104`).
- **Admin login narrow:** NOLOGIN roles; no DML on commands table; no EXECUTE on capability Tx-C or internal helpers (`Posc002cV9AclTest.kt:67-79`).
- **Immutable command/admission:** trigger rejects admission mutation; terminal ABORTED shape enforced (`V9:77-109`).
- **Rotate/revoke durable:** version bump, replay, stranger denied on status (`Posc002cV9AclTest.kt:184-211`).
- **SECURITY DEFINER hygiene:** owner NOLOGIN, `search_path=pg_catalog,pg_temp`, qualified `public.` references (test scans `proconfig`).
- **0..1 guard on pair:** aborts when non-REVOKED companion exists (`V9:323-326`).
- **No GRANT ALL / no activation / no POS guards:** matches slice contract header (`V9:1-2`).

## Residual gates (honest)

| Gate | Status |
|---|---|
| TASK-POSC-002C | **Not done** — SQL foundation only |
| Companion admin pool + Kotlin `CompanionAdministrationPort` + HTTP | Later ship PR (002C remainder) |
| Secret provider idempotency, bearer-once, discard | 002D |
| `pos_companion_effect_guard` / `pos_companion_read_guard` | 002E |
| Full grants matrix / `ALL SEQUENCES` revoke / saga regression | 002F |
| Hosted CI | Not green; local 6 tests are evidence only |
| Fiscal / live connector / `sdd.finish` | Out of scope |
| Second Grok lane | Required before merge per `pr-dual-grok-review.mdc` |
| Atomic deploy | Do **not** merge V9 alone without companion admin adapter/pool cutover |

## Proceed to PR?

**Yes, conditionally.** This uncommitted SQL+tests slice may proceed toward a later **atomic** ship PR (V9 + companion admin adapter + HTTP + provider + race tests) after **both** Grok 4.7 lanes return `APPROVED` and P1 items are scheduled in the same deploy unit (especially `auth_ready` gate on activate and pool isolation). Do **not** merge V9 alone to integration. Do **not** mark TASK-POSC-002C done. Do **not** self-approve on GitHub.

## Reviewer

Grok 4.7 SDD lane — independent review of POSC-002C first deliverable; no implementation edits; Maven not re-run.
