VERDICT: APPROVED

# POSC-002B V8 ACL — independent SDD/code re-review (Grok 4.7 lane: SDD)

Date: 2026-09-29 (re-review after SCOPE lane CHANGES_REQUIRED)  
Branch: `feature/posc002b-v8-acl`  
HEAD: `900c5533228d8ba815695558cd36ed5fd1c47b24`  
Scope: **uncommitted changes only** — V8 SQL + PG16 tests; no HTTP/Tx-S/adapter/controller in this slice.

## SDD why (PR-equivalent)

**Title:** POSC-002B V8 shared capability ACL cutover (SQL + PG16 tests only)

**Why:** Close V3 `PUBLIC`/`storecore_runtime` EXECUTE on the four legacy capability-admin functions and introduce durable Tx-C SQL (`capability_tx_c_execute|status|abort`) with intent/command tables and least-privilege roles — **without** activating `BLACKSTORE_INTEGRATION`, companion schema, POS guards, or 002C–E deliverables.

This slice is the authorized first deliverable of TASK-POSC-002B. Full POSC-002B (pools, Tx-S CSRF, Kotlin adapter, HTTP, recovery routes) remains open.

## What was read (required order)

1. Prior SDD review: `sdd/reviews/20260929-grok-prv8-sdd.md` (prior APPROVED; P1 deploy notes retained below)
2. SCOPE lane gaps: `sdd/reviews/20260929-grok-prv8-scope.md` (G1–G5 CHANGES_REQUIRED)
3. `AGENTS.md`, `sdd/STATUS.md`, `posc002-identity-acl-proposal.md` §Cierre end-to-end, `posc002-implementation-slices.md` POSC-002B
4. Full uncommitted diff:
   - `backend/src/main/resources/db/migration/V8__posc002_shared_capability_cutover.sql` (NEW)
   - `backend/src/test/kotlin/com/storecore/blackstore/Posc002bV8AclTest.kt` (NEW)
   - `backend/src/test/kotlin/com/storecore/blackstore/BlackStorePg16UpgradeAclHarnessTest.kt` (modified harness V8-on-disk / stop-at-V7)

## Validations run (this re-review)

| Check | Result |
|---|---|
| `git status` / uncommitted scope | 2 untracked + 1 modified test file only; no V1–V7 edits |
| `git diff --check` | Clean |
| V3–V7 LF-normalized SHA-256 | Matches POSC-002A fingerprints in harness + V8 test |
| Maven focused suite (re-run) | `mvn "-Dtest=Posc002bV8AclTest,BlackStorePg16UpgradeAclHarnessTest#posc002a*" test` → **Tests run: 15, Failures: 0, Errors: 0, BUILD SUCCESS**, Finished 2026-09-29T20:37:11-03:00 |
| PostgreSQL | 16.14 (Testcontainers `postgres:16-alpine`) |
| Hosted CI | Not invoked; **not treated as CI green** |

## G1–G5 closure (SCOPE lane follow-up)

| Gap | Status | Evidence |
|---|---|---|
| **G1** Populated V7→V8 upgrade | **Closed** | `Posc002bV8AclTest.kt:67-102` seeds user/ADMIN, catalog (brand/product/variant), `inventory_balances`, `blackstore_companions` + `blackstore_companion_credentials` at V7; migrates to V8; asserts module states, companion status, credential status, balance unchanged; `BLACKSTORE_INTEGRATION=DISABLED`; runtime V3 EXECUTE revoked (`L100`); flyway V1–V8 (`L101`) |
| **G2** KILL_REMOVE / KILL_REPLACE success + replay | **Closed** | `Posc002bV8AclTest.kt:300-327` — create → replace canonical `{"module","killSwitchId"}` with execute replay (`L311-318`); remove canonical `{"module","killSwitchId","removed":true}` with status replay (`L321-325`); SQL trigger shape enforced at `V8:172-181` |
| **G3** COMPLETED replay after original session expires | **Closed** | `Posc002bV8AclTest.kt:277-298` — short-lived session (`L279-288`), execute COMPLETED (`L290-291`), sleep past expiry (`L292`), execute replay with expired `session_id` (`L293-295`) and status with renewed session (`L294-296`); precedence matches `V8:242-244` |
| **G4** Admin login cannot EXECUTE V3 four-pack | **Closed** | `Posc002bV8AclTest.kt:118-125` — `has_function_privilege('v8_admin_login', …, 'EXECUTE') = false` for all four exact V3 signatures |
| **G5** Runtime positive intent INSERT + companion_lock_version denial | **Closed** | `Posc002bV8AclTest.kt:164-189` — `v8_runtime_login` INSERT on admission columns succeeds (`L165-178`); UPDATE `companion_lock_version` → SQLSTATE `42501` (`L179-181`); grants at `V8:413-416` |

## Findings

### P0 — none open in this SQL-only slice

No blocker in V8 DDL/tests that would forbid committing this slice as SQL foundation. **Deploying V8 without the Kotlin/admin-pool cutover is a production break** (see residual gates); that is expected and out of scope for this diff alone.

### P1 — must close before TASK-POSC-002B / atomic ship

| ID | Finding | Evidence |
|---|---|---|
| P1-01 | **CHANGE_STATE always writes `config='{}'::jsonb`**, discarding typed configuration that V3 preserved via `p_config`. Safe for `{}`-only modules exercised in tests; unsafe for modules with non-empty typed config. Intent schema has no config payload yet — adapter must extend intent or stop wiping config before production cutover. | `V8__posc002_shared_capability_cutover.sql:270-271` vs `V3__capability_administration.sql:82` |
| P1-02 | **No function-level READ COMMITTED guard** on Tx-C (unlike POS guard spec). Revalidation after lock waits is present (`capability_admin_session_is_live_admin` at 256-258, 375-377), but RR/Serializable ambient transactions are not rejected inside SQL. Later adapter must pin pool isolation; add PG16 negative when adapter lands or add explicit `current_setting('transaction_isolation')` check before ship. | `V8:217-393`; test only scans `prosrc` for literal `repeatable read` (`Posc002bV8AclTest.kt:137`) |
| P1-03 | **Tx-S / CSRF / intent admission not implemented** — superuser still used for some intent fixtures; runtime positive INSERT is proven but production path requires Tx-S coordinator. Required for full 002B; must not ship admin HTTP until wired. | Out of slice; `posc002-implementation-slices.md` POSC-002B protocol |

### P2 — improve before closing 002B or broad regression matrix

| ID | Finding | Evidence |
|---|---|---|
| P2-01 | **Admin-wins mutante** under shared anchor (admin holds action `FOR UPDATE`, effect waits, admin commits, effect re-reads) not demonstrated — only lock-order wait while kill-switch row is held (`abortCreatesTheMissingCommandAndLocksActionsBeforeConfigBeforeSwitches`). | `Posc002bV8AclTest.kt:364-420` |
| P2-02 | **Harness POSC-002A** now expects V8 file on disk while still stopping Flyway at V7 — correct for this branch; ensure both lanes agree this is branch-local, not a retroactive change to merged 002A SHA. | `BlackStorePg16UpgradeAclHarnessTest.kt:63-66,146` |
| P2-03 | **G1 populated upgrade** does not reuse the full POSC-001 staged saga/ML fixture nor diff grants/catalog inventory post-V8 beyond data preservation + runtime V3 revoke; acceptable for this slice but 002F may widen. | `Posc002bV8AclTest.kt:67-102` |
| P2-04 | Integration tests elsewhere still call V3 via superuser JDBC (`CommerceHttpIntegrationTest`, etc.). Full backend suite after V8 apply needs coordinated adapter work or selective exclusion — not validated here. | Out of slice |
| P2-05 | **V1 checksum omitted** in test map (`null` at L48): V3–V7 pinned; low risk but incomplete vs “V1–V8” wording. | `Posc002bV8AclTest.kt:47-48` |

## What the slice gets right (evidence-backed)

- **V3 closure on authorized principals:** REVOKE EXECUTE of four exact V3 signatures from `PUBLIC` and `storecore_runtime` (`V8:15-18`); tests deny runtime V3 and PUBLIC Tx-C (`Posc002bV8AclTest.kt:111-112,158-159`).
- **Authorized roles:** `storecore_capability_admin_owner` / `storecore_capability_admin` NOLOGIN; narrow EXECUTE on three Tx-C functions only; no direct DML for admin login (`V8:401-406,434`; test `rolesStayNologinAndAdminExecuteIsNarrow`).
- **Intent immutability:** append-only admission; UPDATE limited to `capability_lock_version` increment; trigger SQLSTATE `23514` (`V8:105-139`; test `admissionTriggerRejectsMutationAndUnknownWire`).
- **Command terminal semantics:** PENDING → null status; ABORTED exactly `{"status":"ABORTED"}`; COMPLETED result shape enforced by trigger (`V8:155-189`; tests throughout).
- **Session rules:** execute requires original `session_id` for PENDING; terminal replay before session re-check (`V8:242-247,337-348,361-377`; tests `expiredOriginalSessionCannotExecuteAndReauthCanAbort`, `completedResultReplaysAfterOriginalSessionExpires`).
- **Kill-switch lifecycle:** KILL_CREATE/REMOVE/REPLACE end-to-end with canonical JSON and replay (`Posc002bV8AclTest.kt:300-327`).
- **BLACKSTORE fail-closed:** durable abort, state stays DISABLED (`V8:260-263`; test `blackStoreStaysDisabledAndSearchPathHomonymIsIgnored`).
- **Lock order:** actions → config → switches before effect/abort; concurrent race shows waiter holds all three (`V8:252-254,372-374`; test `abortCreatesTheMissingCommandAndLocksActionsBeforeConfigBeforeSwitches`).
- **One winner:** execute vs abort races in both orders (`Posc002bV8AclTest.kt:422-474`).
- **SECURITY DEFINER hygiene:** owner NOLOGIN, `search_path` pg_catalog/pg_temp, qualified `public.` references; homograph schema ignored (`V8:217-220`; test `blackStoreStaysDisabledAndSearchPathHomonymIsIgnored`).
- **No GRANT ALL / no V1–V7 file edits:** checksums preserved; Flyway V8 additive (`Posc002bV8AclTest.kt:46-64`).
- **companion_lock_version:** no UPDATE grant to owner until 002C (test L116).

## Residual gates (honest)

| Gate | Status |
|---|---|
| TASK-POSC-002B | **Not done** — SQL foundation only |
| Documentary Sol/Astra GO | Not code GO |
| Tx-S runtime + admin pool + CapabilityController/adapter | Later ship PR |
| HTTP 409 mapping, correlationId client contract | Later |
| Companion / POS nine functions (002C–E) | Out of scope |
| ML REPEATABLE_READ admin-wins | Remains NO-GO / separate SDD |
| Hosted CI | Not green; local 15 tests are evidence only |
| Atomic deploy | **Never apply V8 without adapter cutover** — V3 revoked for runtime breaks current `JdbcCapabilityService` admin path |
| `sdd.finish` / WIP archive | Not allowed |
| Second Grok lane | SCOPE lane must also APPROVED before merge per `pr-dual-grok-review.mdc` |

## Proceed to /ship PR?

**Yes, conditionally.** This uncommitted SQL+tests slice may proceed to a later **atomic** ship PR (V8 + admin adapter + HTTP + tests) after **both** Grok 4.7 lanes return `APPROVED` and P1 items are scheduled in the same deploy unit (especially config preservation and pool isolation). Do **not** merge V8 alone to integration. Do **not** mark TASK-POSC-002B done. Do **not** self-approve on GitHub.

## Reviewer

Grok 4.7 SDD lane — independent re-review after SCOPE G1–G5 remediation; no implementation edits.
