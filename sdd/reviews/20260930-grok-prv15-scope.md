VERDICT: APPROVED

# Grok 4.7 — POSC-002C companion admin HTTP + provider scope review (SCOPE lane)

**Date:** 2026-09-30  
**Lane:** SCOPE  
**Feature:** POSC-002C — residual companion admin HTTP + secret provider  
**Branch:** `feature/posc002c-companion-admin-http` @ `8bc95cf` (`origin/integration/storecore-int`) plus **uncommitted working-tree delta**  
**PR:** none yet  
**Integration head (committed):** `8bc95cf` (merge POSC-002B HTTP/Tx-S, PR #72)  
**Reviewed against:** `sdd/wip/20260927-pos-integration-convergence/3-tasks/posc002-implementation-slices.md` (POSC-002C), `sdd/wip/20260927-pos-integration-convergence/2-technical/posc002-identity-acl-proposal.md`, `AGENTS.md`  
**No merge.** This file does not approve GitHub, does not call CI green, does not authorize deploy/tag/push, and does not authorize `/sdd.finish`.

## What was read

1. `AGENTS.md`, POSC-002C slice ownership/acceptance and OUT-of-scope boundaries (Flyway V11, YAML 7-route, V3, POSC-003, public abort).
2. Prior SCOPE format: `sdd/reviews/20260930-grok-prv14-scope.md`.
3. Full working-tree delta vs `origin/integration/storecore-int`: 9 modified paths + 17 untracked files under `backend/src/main/kotlin/com/storecore/{blackstore,shared}/**`, matching tests, and SDD traceability.
4. Installed V9 SQL (`V9__posc002c_companion_admin.sql`) via Flyway during tests — no new migration in delta.
5. Implementation spot-checks: `HttpCode`, `BaseResponse` factories, `CompanionAdminController`, `CompanionAdminCommandService`, `JdbcCompanionAdminCommands`, `CompanionAdminExceptionAdvice`, `CompanionAdminDataSourceConfig`, `CompanionSecretProvider` / `InMemoryCompanionSecretProvider`, closed domain types, `Posc002c*` tests, `BlackStoreRouteTopologyHarnessTest` companion inventory.

## SDD why (002C HTTP + provider)

Close the residual after V9 merge: USER ADMIN+CSRF internal routes for companion pair/activate/suspend/rotate/revoke and GET status; separate `storecore.companion-admin` pool calling V9 Tx-P entry points; install/test secret provider with idempotent `prepare`/`resolve`/`discard`; `HttpCode` closed type and `BaseResponse` factories where `status == body.code`; bearer delivered once, never in replay/status. Must not edit Flyway, activate `BLACKSTORE_INTEGRATION`, unlock POSC-003, expose abort as public BlackStore HTTP, or rewrite unrelated controllers.

## Scope checklist

| Requirement | Code / config | Result |
| --- | --- | --- |
| `HttpCode` closed type + `fromWire`/`Unknown` | `backend/src/main/kotlin/com/storecore/shared/http/HttpCode.kt` | PASS |
| `BaseResponse` factories: status HTTP = `code` | `IdentityController.kt` companion `ok(data, HttpCode)`, `created`, `error`; controller/advice use `ResponseEntity.status(body.code)` | PASS |
| Do not rewrite every existing controller | Only companion admin controller/advice + minimal `BaseResponse` factory extension | PASS |
| `CompanionAdminController` six routes | POST pair/rotate/activate/suspend/revoke + GET `commands/{correlationId}` under `/api/v1/internal/admin/blackstore-companion` | PASS |
| USER ADMIN + same-origin + CSRF on mutations | `RequestAuth.admin` / `requireSameOrigin`; `@RequestHeader("X-CSRF-Token")` on POSTs | PASS |
| GET status: metadata only, no bearer/ref | `publicView` omits bearer unless first delivery; HTTP/TxP tests assert no `synthetic:` / bearer on replay/status | PASS |
| Companion-admin datasource pool | `CompanionAdminDataSourceConfig` gated on `storecore.companion-admin.datasource.url`; `CompanionAdminJdbc` separate login | PASS |
| Missing pool fails closed | `JdbcCompanionAdminCommands.admin()` → `CompanionAdminPoolMissing` (503 retryable); `Posc002cCompanionAdminTxPTest#missingPoolFailsClosedBeforeSql` | PASS |
| Jdbc adapter calls V9 Tx-P + effect functions | `companion_admin_prepare_command`, `attach_secret`, `command_status`, `pair`, `rotate`, `activate`, `suspend`, `revoke` | PASS |
| Provider `prepare`/`resolve`/`discard` on pair/rotate | `CompanionSecretProvider` port extended; `InMemoryCompanionSecretProvider` idempotent by `requestId`; `discard` on ABORTED | PASS |
| CSRF Tx-S (runtime) then admin pool | `CompanionAdminCommandService.mutate`: `TransactionTemplate` verify+rotate CSRF, then admin JDBC outside that transaction | PASS |
| Does **not** wrap companion SQL in `IdentityMutationCoordinator` | Topology harness asserts adapter source has no `IdentityMutationCoordinator`; service uses dedicated command port | PASS |
| No Flyway delta / no V11 | `git diff` shows zero migration changes | PASS |
| No YAML BlackStore 7-route changes | Canonical OpenAPI untouched | PASS |
| No capability V3 re-exposure | `Posc002fAcceptanceMatrixTest` still forbids V3 SELECTs in `JdbcCapabilityService` | PASS |
| `BLACKSTORE_INTEGRATION` not activated by this cut | HTTP/TxP tests assert module config stays `DISABLED`; activate test uses direct SQL fixture only | PASS |
| No public abort route | `companion_admin_abort_command` not exposed on HTTP (SQL-only, per slice) | PASS |
| POSC-003 remains blocked | `tasks.json` unchanged gate; SDD honest about residual | PASS |
| Topology inventory | `BlackStoreRouteTopologyHarnessTest` expects six companion routes + HttpCode envelope wiring | PASS |
| Honest SDD status | `sdd/STATUS.md`, slices, `tasks.json` mark 002C `http_provider_pending_dual_review` | PASS |
| Does not claim hosted CI green | Not asserted | PASS |

## Recorded validation (not CI)

| Run | Command / scope | Result | Timestamp |
| --- | --- | --- | --- |
| 1 | `git status` + `git diff --stat origin/integration/storecore-int` | 9 modified + 17 untracked; delta confined to companion admin HTTP/provider, HttpCode, tests, SDD | 2026-09-30T01:00-03:00 |
| 2 | `git rev-parse HEAD origin/integration/storecore-int` | both `8bc95cf` (committed head); working tree uncommitted | 2026-09-30T01:00-03:00 |
| 3 | `mvn -q "-Dtest=Posc002cHttpCodeTest,Posc002cCompanionAdminOperationTest,Posc002cCompanionAdminTxPTest,Posc002cCompanionAdminHttpTest" test` | BUILD SUCCESS (PG16 Testcontainers + HTTP loopback) | 2026-09-30T01:01-03:00 |
| 4 | `mvn -q "-Dtest=BlackStoreRouteTopologyHarnessTest#spring inventory includes companion admin routes and httpcode envelope" test` | BUILD SUCCESS | 2026-09-30T01:03-03:00 |
| 5 | Source inspection: `rg Flyway\|V11` on delta paths | no migration edits | 2026-09-30T01:03-03:00 |
| 6 | Source inspection: `CompanionAdminController` route count | 6 handlers match slice | 2026-09-30T01:03-03:00 |
| 7 | `Posc002cHttpCodeTest#baseResponseFactoriesKeepHttpStatusEqualToBodyCode` | status/body.code parity proven for ok/created/error | 2026-09-30T01:01-03:00 |

No hosted Verify run; billing/spending-limit exception unchanged in `sdd/STATUS.md`.

## Fact checks (delta vs slice)

- **Admin split:** Runtime CSRF consumption occurs inside `TransactionTemplate`; V9 prepare/attach/pair/rotate/state SQL runs on `CompanionAdminJdbc` afterward — admin work is not enrolled in the identity CSRF transaction.
- **Idempotency:** Correlation + hash enforced in SQL via `companion_admin_prepare_command`; HTTP replay returns metadata without bearer; provider `prepare(requestId, …)` is idempotent on correlation string.
- **Bearer once:** First pair HTTP response includes 64-char hex bearer; replay and GET status omit it; no secret ref in wire (`Posc002cCompanionAdminHttpTest`).
- **Closed types at wire edge:** `CompanionAdminOperation.fromWire` → `Unknown`; scopes/state use domain closed types in controller mapping.
- **002F residual closed:** Matrix test flipped from “no CompanionAdminController” to “controller exists”; temporary capability ACTIVE uses direct SQL, not V3 adapter — consistent with 002B cutover.
- **Production config:** Default `application.yml` has no `storecore.companion-admin.*`; bean absent → mutations fail closed with `COMPANION_ADMIN_POOL_MISSING` — intentional per-installation wiring.

## Findings (SCOPE lane)

### P0 — none

No automatic CHANGES_REQUIRED trigger: Flyway untouched; six internal routes present; admin pool segregated; BLACKSTORE not activated; POSC-003 not unlocked; no public abort; no out-of-scope controller rewrites.

### P1 — informational (non-blocking)

- **HTTP acceptance thinner than slice prose:** Evidence covers pair/replay/status, activate fail-closed + revoke, customer denial, and PG16 Tx-P paths. Rotate/suspend HTTP, invalid CSRF, OPERATOR denial, pool-missing over HTTP, payload-conflict replay, and crash/recovery HTTP scenarios from the full 002C/002F matrix are not yet exercised in `Posc002c*` suites (core happy path + fail-closed activate proven).
- **No runtime durable intent row for companion:** Unlike capability admin (runtime `capability_admin_intents` INSERT in Tx-S), companion idempotency lives in V9 `companion_admin_prepare_command` on the admin connection after CSRF consume. Architecturally consistent with companion Tx-P ownership; recovery story relies on SQL command rows + GET status rather than capability-style intent table.
- **`companion_admin_abort_command` SQL unwired at HTTP:** Correct per slice (“Abort HTTP no es ruta pública”); operator abort/recovery remains SQL/internal — document in rollout if CLI/bootstrap needed.
- **Bearer wire format:** Admin response exposes hex encoding of 256-bit raw bytes (`CompanionTokenGenerator.toHex`); operator must load decoded bytes into installation secret manager — acceptable but should stay explicit in runbook.
- **Error mapping breadth:** `JdbcCompanionAdminCommands.mapAdminError` collapses unknown SQL failures to `CompanionAdminPayloadConflict` (409) — may obscure session/pool errors until SQL messages stabilize.
- **JSON parsing:** `parseResult` uses regex over function JSON return — works for current shape; brittle if SQL JSON formatting changes (test coverage on pair/rotate outcomes mitigates).

### P2 — informational

- **`BaseResponse` HttpCode overloads** live beside legacy `IdentityController` DTO; other controllers unchanged — matches “do not rewrite every controller” gate; future slices may adopt `HttpCode` incrementally.
- **Install secret provider:** Only `InMemoryCompanionSecretProvider` in repo; production install adapter is configuration/deferred — expected for SDD-only repo.
- **Working tree uncommitted:** Review covers local delta; merge still requires commit, dual Grok 4.7 (this SCOPE lane + SDD lane), and honest close-out per repo rules.

## Residual gates (out of 002C SCOPE lane)

- TASK-POSC-002 / POSC-003: remain blocked until 002C merge + full 002A–G evidence and dual reviews on final SHA.
- Production companion-admin pool + install secret provider wiring per VM (configuration, not default YAML).
- Full nine-command grant-negative PG16 matrix and HTTP race catalog (shared with 002F refresh where applicable).
- `INSERT(variant_id)` runtime grant residual, ML REPEATABLE READ (`TASK-DSP-000B`), live connector, fiscal, `/sdd.finish` — own gates unchanged.

## Summary

POSC-002C companion admin HTTP + provider SCOPE lane **APPROVED**. The working-tree delta adds `HttpCode` + `BaseResponse` factories (status == body.code), six USER ADMIN internal routes with CSRF-on-runtime then companion-admin pool, V9 Tx-P JDBC adapter, idempotent test provider, PG16+HTTP evidence, and topology inventory — without Flyway edits, BLACKSTORE activation, POSC-003 unlock, or out-of-scope surface changes. P1 gaps are test-depth and operational-documentation nits, not scope breaches. This verdict is scope-only — no merge, no GitHub approve, no `/sdd.finish`.
