VERDICT: CHANGES_REQUIRED

# Sol validation — POS fail-closed implementation and next gate

**Date:** 2026-09-23  
**Branch:** `feature/pos-pic-001-009-fail-closed`  
**Scope:** local StoreCore implementation only; no live BlackStore, merge, activation, deploy, or `/sdd.finish`.

## Validation result

The focused command requested from `backend/` passed with exit code 0:

`mvn -q "-Dtest=BlackStoreRateLimiterTest,BlackStoreSagaEngineTest,BlackStoreFailClosedHttpTest,BlackStoreSchemaMigrationTest,BlackStoreIntegrationServiceTest,BlackStoreCompanionStoreTest" test`

The six selected suites report **22 tests, 0 failures, 0 errors, 0 skipped**:

- `BlackStoreRateLimiterTest`: 3
- `BlackStoreSagaEngineTest`: 11
- `BlackStoreFailClosedHttpTest`: 2
- `BlackStoreSchemaMigrationTest`: 3
- `BlackStoreIntegrationServiceTest`: 2
- `BlackStoreCompanionStoreTest`: 1

This is local focused evidence, not CI green.

## Findings

### 1. Exposed POS behavior remains fail-closed — PASS

- Every operational HTTP route reaches `BlackStoreIntegrationService.requireEnabled` before header/body parsing, companion binding, rate limiting, catalog access, saga access, or ML enqueue. With the real seeded row `DISABLED`, the HTTP suite returns 403 `CAPABILITY_DISABLED`, no `Retry-After`, no operation rows, and no `EXTERNAL_BLACKSTORE` ledger rows.
- `If-None-Match` cannot produce 304 while disabled because capability evaluation precedes catalog loading and ETag comparison.
- Expiry and purge workers return 0 while disabled and do not call the saga engine.
- The ML adapter remains disabled and returns false.
- V5 seeds `BLACKSTORE_INTEGRATION` as `DISABLED`, `future_optional=true`, schema v2. V6 is saga DDL and contains no PIC-010 promotion. No `future_optional=false` or BlackStore state activation was found.

### 2. Task state remains honest — PASS

`tasks.json`, `progress.md`, and `STATUS.md` keep only PIC-001, PIC-002, and PIC-008 done. PIC-003..007 and PIC-009 remain `in_progress`; PIC-010 remains `pending`; L3-001..003 remain `in_progress`. HTTP 200/304/409/410 acceptance criteria are not claimed complete.

### 3. New companion rotation is not capability fail-closed — BLOCKING

`JdbcBlackStoreCompanionStore.rotateSecret` performs a durable revoke-and-insert transaction without consulting `CapabilityDecisionPort`, module state, or an authorized administration port. `BlackStoreCompanionStoreTest` explicitly proves that this mutation succeeds while `BLACKSTORE_INTEGRATION` remains `DISABLED`.

There is currently no HTTP route calling this method, so the tested POS HTTP surface still fails closed. Nevertheless, the new public Spring bean operation is an associated credential effect that bypasses the capability-first boundary required by `20260923-sol-pos-impl-go.md`. Prefix checks for `sk_live_` and `Bearer ` are not an authorization boundary and do not establish that an arbitrary string is an opaque reference.

Required disposition before this gate can approve the working tree: remove/defer the rotation operation, or put it behind an explicit approved administration contract with capability/role/CAS/audit semantics and tests proving denial while unauthorized/disabled. Do not add a real secret, vendor authentication, or HMAC.

### 4. `assertBound` and 304 remain deny-first — PASS with residual

- `assertBound` rejects zero, multiple, or mismatched non-revoked companions with 403 and is reached only after capability approval in the facade.
- Matching `If-None-Match` is evaluated only after capability approval and companion binding, so it cannot bypass the disabled gate.
- Residual for the next implementation tranche: the comparison is a raw string comparison. A normal HTTP `If-None-Match` value is quoted (and may be weak), while the current unit test passes an unquoted value. PIC-003 must not be marked done until HTTP-level 304 behavior is proven against the contract.

No BlackStore/vendor HMAC was added and no real credential was found.

### 5. Next-go is directionally valid but documentation must be normalized

`20260923-sol-pos-next-go.md` explicitly expands the earlier gate only for PIC-010 and an isolated Testcontainers activation. Its substantive controls match ADR-008: one-row lock/asserts, `DISABLED` schema v2 precondition, narrow trigger disable/re-enable, one-column promotion, no runtime registry privilege, and later activation only through public ADMIN CAS/audit.

The migration number is not yet consistent across canonical documents. The next-go correctly says V5 is registry, V6 is saga, and PIC-010 must use the next free version (currently V7). ADR-008 and `tasks.json` still call PIC-010 “V6”. Normalize those references before creating the migration; V6 must not be reused or edited.

### 6. Review coverage and unrelated leftovers

Dual Grok r4 remains valid for the fail-closed facade it recorded, but its command did not include `BlackStoreCompanionStoreTest` and its review does not approve the newly added rotation effect. The current tree therefore needs re-review after the blocking disposition.

The three `EffectivePrice*.kt` files remain untracked. Workspace search found references only inside those three files; the POS implementation does not reference them. They must remain untracked and untouched.

## Allowed next implementation

- Under the existing PIC-001..009 gate: resolve the companion-rotation fail-closed gap, prove quoted/weak ETag handling at HTTP level, keep PIC-003..007/009 in progress, and re-run focused validation plus both required Grok lanes.
- After this validation becomes approved and canonical V6/V7 wording is normalized: PIC-010 may use the next free Flyway version, then isolated Testcontainers may transition through public ADMIN CAS/audit solely to test 200/304/409/410 behavior with local doubles.

## Still NO-GO

- Live BlackStore companion, POS traffic, external/cross-database access, real endpoints or credentials.
- Invented HMAC/vendor authentication, fiscal code/DDL/workers, and MP-LIVE-05.
- Marking PIC-003..007/009 or L3 done without complete green evidence.
- Merge, activation outside the isolated test, archive, `/sdd.finish`, deploy, tag, release, publish, or secrets/CI changes.
