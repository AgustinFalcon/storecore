VERDICT: APPROVED

# POSC-002B V8 ACL — independent Grok 4.7 scope re-review (SCOPE lane)

**Date:** 2026-09-29  
**Branch:** `feature/posc002b-v8-acl` @ `900c5533228d8ba815695558cd36ed5fd1c47b24`  
**Scope reviewed:** uncommitted delta only — `V8__posc002_shared_capability_cutover.sql`, `Posc002bV8AclTest.kt`, harness tweak in `BlackStorePg16UpgradeAclHarnessTest.kt`.  
**Prior verdict:** CHANGES_REQUIRED (G1–G5). This re-review verifies those gaps are closed.  
**Out of scope (not scored):** HTTP 409, Tx-S/CSRF coordinator, frontend actor-bound flows, Kotlin closed types, companion/POS 002C–E objects, CI remoto, TASK-POSC-002B completion.

## Validation recorded

| Check | Result |
|---|---|
| Command | `mvn "-Dtest=Posc002bV8AclTest,BlackStorePg16UpgradeAclHarnessTest#posc002a*" test` |
| When | 2026-09-29T20:35 (parent/local; not re-run this review) |
| PG | 16.x (Testcontainers `postgres:16-alpine`) |
| Totals | Tests run: 15, Failures: 0, BUILD SUCCESS |

Local green is noted; it is not CI and does not close POSC-002B acceptance alone.

## G1–G5 closure evidence

| Gap | Status | Evidence |
|---|---|---|
| **G1** Populated V7→V8 | **CLOSED** | `Posc002bV8AclTest.kt` L67–102: separate DB migrates to V7, seeds user/admin, catalog, inventory, companion+credential (L73–89), snapshots before-state (L90–93), migrates V8 (L94), asserts module/companion/credential/balance preservation (L95–98), `BLACKSTORE_INTEGRATION=DISABLED` (L99), runtime V3 EXECUTE denial post-V8 (L100), flyway 1–8 (L101). V8 L15–18 revokes all four V3 signatures from PUBLIC/runtime. |
| **G2** KILL_REMOVE / KILL_REPLACE | **CLOSED** | `killRemoveAndReplacePersistCanonicalResults` L300–327: CREATE → REPLACE canonical `{"module","killSwitchId"}` (L310–318) → REMOVE canonical `{"module","killSwitchId","removed":true}` (L321–325) with execute/status replay. SQL terminal shape enforcement V8 L172–181; effect bodies V8 L292–320. |
| **G3** COMPLETED replay after expired original session | **CLOSED** | `completedResultReplaysAfterOriginalSessionExpires` L277–298: 1–2s session, execute to COMPLETED (L289–291), sleep past expiry (L292), execute replay with expired `shortLived` (L293–295) and status with `renewedSession` (L294–296) both return persisted JSON. Precedence implemented V8 L242–244 (terminal return before session gate). |
| **G4** Admin login V3 EXECUTE denial | **CLOSED** | `rolesStayNologinAndAdminExecuteIsNarrow` L118–125: `has_function_privilege('v8_admin_login', …, 'EXECUTE') = false` for all four V3 signatures (change_configuration, create/remove/replace_kill_switch). V8 L15–18 REVOKE; no GRANT to admin login role. |
| **G5** Runtime positive intent INSERT + companion_lock denial | **CLOSED** | `directDmlAndV3CallsFailClosed` L164–189: `v8_runtime_login` INSERT admission columns succeeds (`executeUpdate()==1`, L165–178); UPDATE `companion_lock_version` → `42501` (L179–181); lock column unchanged (L182–188). V8 L413–416 narrow INSERT grant; L423 owner UPDATE only `capability_lock_version`; L116 test confirms no `companion_lock_version` UPDATE for owner. |

## Additional contract evidence (unchanged, still satisfied)

- Two NOLOGIN roles, no LOGIN: V8 L4–11; test L105–109.
- Tx-C definer owner `storecore_capability_admin_owner`, `search_path=pg_catalog,pg_temp`, qualified `public.`: V8 L217–397.
- Lock order action→config→switch: V8 L252–254; test `abortCreatesTheMissingCommandAndLocksActionsBeforeConfigBeforeSwitches` L365–419.
- BLACKSTORE durable abort, no activation: V8 L260–263; tests L330–341, populated upgrade L99.
- V1–V7 migration **files** unmodified: test L46–58; harness preflight still stops at V7 with V8 present-not-applied L63–66.
- Harness tweak: `BlackStorePg16UpgradeAclHarnessTest.kt` L63–66 asserts V8 file exists; L139–140 confirms V8 not in V7 history.

## Residual (explicitly out of slice APPROVED scope)

- **Full POSC-002B not done:** no capability admin pool, Tx-S CSRF coordinator, HTTP routes, or `JdbcCapabilityService` rewiring — required before deploy per plan §atomic unit; do **not** mark TASK-POSC-002B done.
- **G1 depth:** populated upgrade seeds catalog/inventory/companion, not full POSC-001 saga/ML/order matrix; acceptable for this SQL/ACL slice but POSC-002F will need broader upgrade diff.
- **CI:** no remote green claim; billing/spending-limit exceptions are not passes.
- **Second lane:** merge still requires both Grok 4.7 lanes APPROVED plus honest SDD close-out.

## Verdict rationale

All five prior CHANGES_REQUIRED items (G1–G5) are present in the uncommitted delta with file:line evidence and align with `posc002-identity-acl-proposal.md` Tx-C recovery precedence and `posc002-implementation-slices.md` POSC-002B SQL/ACL first deliverable. SQL design remains faithful: narrow roles, V3 closure, immutable intents, definer Tx-C with lock order, durable BLACKSTORE abort, no 002C–E leakage. Under strict **scope** rules for this slice, verdict is **APPROVED**. Do **not** merge until the parallel SDD lane approves and Sol/Terra close-out is honest about deferred HTTP/Tx-S work.
