VERDICT: APPROVED

# POSC-002C V9 companion ACL — independent Grok 4.7 scope review (SCOPE lane)

**Date:** 2026-09-29  
**Branch:** `feature/posc002c-companion-schema` @ `20152b9` (base includes merged V8 from PR #66)  
**Scope reviewed:** uncommitted delta only — `V9__posc002c_companion_admin.sql`, `Posc002cCompanionAclTest.kt` (`Posc002cV9AclTest`). V8 committed on branch; not re-scored.  
**Out of scope (not scored):** HTTP internal admin routes, secret provider adapter, Tx-S CSRF coordinator wiring, POS effect/read guards (002E), bearer verifier (002D), race tests, CI remoto, TASK-POSC-002C completion.

## Validation recorded

| Check | Result |
|---|---|
| Command | `mvn -Dtest=Posc002cV9AclTest test` |
| When | 2026-09-29T22:12:04-03:00 (parent/local; not re-run this review) |
| PG | 16.14 (Testcontainers `postgres:16-alpine`) |
| Totals | Tests run: 6, Failures: 0, Errors: 0, BUILD SUCCESS |

Local green is noted; it is not CI and does not close POSC-002C acceptance alone.

## Scope contract evidence

| Requirement | Status | Evidence |
|---|---|---|
| Two NOLOGIN roles `storecore_companion_admin_owner` / `storecore_companion_admin` | **PASS** | V9 L4–11; test `rolesStayNologinAndExecuteIsNarrow` L69 |
| Admin login EXECUTE only on nine entry points; no DML | **PASS** | V9 L510–518 (prepare/attach/status/abort/pair/activate/suspend/rotate/revoke); test L72–73, L77 (no commands INSERT on role) |
| No Tx-C capability execute for companion admin | **PASS** | Test L74: `has_function_privilege(..., 'capability_tx_c_execute') = false` |
| No EXECUTE on `apply_state` / `lock_shared_anchor` / `digest` / `allowed_scopes` for companion login | **PASS** | V9 L502–508 REVOKE incl. `storecore_companion_admin`; test L75–76 |
| REVOKE companion EXECUTE from PUBLIC, runtime, capability_admin | **PASS** | V9 L496–508; runtime/blank denial test L84–90, L100–103 |
| Runtime: no companion DML; column-limited SELECT (`created_at` denied) | **PASS** | V9 L535–537; test `v1ThroughV8...` L63; `runtimeAndBlankLoginsFailClosed` L86–87, L91–93 |
| Owner cannot UPDATE `module_configurations.state` (lock via `updated_at` only) | **PASS** | V9 L527 (`UPDATE(updated_at)` only); test L78 |
| SECURITY DEFINER + `search_path=pg_catalog,pg_temp` on `companion_admin_*` mutators | **PASS** | V9 L149–475 (11 definer bodies); test L79 (zero `companion_admin_%` without search_path) |
| Legacy V8→V9: `auth_ready=false` while credential `ACTIVE`; BLACKSTORE stays DISABLED | **PASS** | V9 L20 DEFAULT FALSE + constraint L22–26; test `v1ThroughV8...` L56–61, L59 |
| V3/V8 checksums pinned; Flyway 1–9 | **PASS** | Test L44–49 (V3/V8 SHA-256); L62 flyway 1–9 on populated upgrade |
| Prepare replay | **PASS** | Test `prepareAttachPairReplays...` L135–136 |
| Attach identical replay | **PASS** | Test L137–138 |
| Attach mismatch → `23514` | **PASS** | Test L139–142 |
| Pair replay | **PASS** | Test L143–145 |
| Hash mismatch → `23514` | **PASS** | Test `hashMismatchAbortsNothing...` L163–166 |
| Abort durable | **PASS** | Test L168–171 |
| Activate durable abort while BLACKSTORE DISABLED | **PASS** | V9 L432–436; test L175–180 |
| Rotate + revoke durable | **PASS** | Test `rotateAndRevokeAreDurableAndStrangerIsDenied` L184–205 |
| Stranger → `42501` | **PASS** | Test L207–210 |
| Expired session → `42501` | **PASS** | Test L116–120 |
| Status hides `secret_ref` | **PASS** | Test L150–152 |
| `p_live_session` consumes 002B session helper; `p_actor` never authenticates alone | **PASS** | V9 L14 GRANT owner EXECUTE on `capability_admin_session_is_live_admin`; all entry points gate on `(p_actor, p_live_session)` e.g. L172–173; expired-session denial L116–120 |
| No V1–V8 edits | **PASS** | Git untracked only V9 + test; test L44–49 pins V3/V8 checksums |
| No GRANT ALL, no POS guards, no HTTP | **PASS** | V9 L2–3 header; no `pos_companion_*` objects; no Kotlin product code |

## Additional design evidence (aligned with proposal)

- **0..1 companion enforcement:** pair aborts when live companion exists — V9 L323–325 (SQL; collision path not PG-tested this slice).
- **Tx-P command table + immutable audit:** V9 L32–75, triggers L107–119.
- **Shared anchor lock order action→config→switch:** V9 L148–154, invoked before pair/rotate/state — L319, L371, L427.
- **Credential quarantine constraint:** `auth_ready` requires fingerprint/scopes/role — V9 L22–26; new pair sets `auth_ready=TRUE` — L328–329; test L149.
- **Runtime registry ACL replacement:** V9 L535–537 revokes V5 broad grants, re-grants column lists per manifiesto.
- **Internal helpers not exposed:** `companion_admin_apply_state` REVOKE from admin login — V9 L502; only activate/suspend/revoke wrappers granted.

## Residual (explicitly out of slice APPROVED scope)

- **Full POSC-002C not done:** no companion admin pool/datasource, secret provider port, HTTP `/internal/admin/blackstore-companion/*`, or Tx-S durable coordinator — required by plan §002C before deploy; do **not** mark TASK-POSC-002C done.
- **P2 / deferred tests:** no two-connection race (admin-wins/effect-wins); `suspend` not individually exercised; pair 0..1 collision abort path SQL-only; no runtime positive SELECT column matrix beyond `created_at` denial.
- **Downstream slices:** POS guards (002E), bearer HTTP (002D), populated saga/ML upgrade matrix (002F).
- **CI:** no remote green claim; billing/spending-limit exceptions are not passes.
- **Second lane:** merge still requires both Grok 4.7 lanes APPROVED plus honest SDD close-out.

## Verdict rationale

Every mandatory scope item in the review brief is present in the uncommitted V9 SQL and `Posc002cV9AclTest` with file:line evidence, aligns with `posc002-identity-acl-proposal.md` nine-entry-point manifiesto and `posc002-implementation-slices.md` POSC-002C first-deliverable boundaries, and reuses V8 `capability_admin_session_is_live_admin` without widening runtime/companion ACL. Recorded PG16 local run is 6/6 green. Under strict **scope** rules for this SQL+PG16 slice, verdict is **APPROVED**. Do **not** merge until the parallel SDD lane approves and Sol/Terra close-out is honest about deferred HTTP/provider/race work.
