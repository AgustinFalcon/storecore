VERDICT: APPROVED

# Grok 4.7 — POSC-003E scope (prv21)

**Lane:** SCOPE  
**Feature:** POSC-003E — reserva Tx-A/Tx-B y hash H2  
**GitHub base:** `origin/integration/storecore-int` @ `eb59fb7` (POSC-003D stock read merge)  
**Branch:** `feature/posc003e-reserve-h2` @ `840f5cb` (`Add H2 reservation hashes and drop YAML-absent reserve codes.`)  
**Reviewed diff:** `git diff origin/integration/storecore-int...840f5cb` — one commit, 16 files, +466 / −45  
**No merge.** This file does not approve GitHub, does not call CI green, does not authorize `/sdd.finish`, and does not enable live BlackStore traffic.

## What was read

1. `sdd/wip/20260927-pos-integration-convergence/3-tasks/posc003-implementation-slices.md` — slice **POSC-003E** (ownership, dependencia 003D, aceptación).
2. `sdd/wip/20260927-pos-integration-convergence/2-technical/posc003-catalog-reserve-proposal.md` — sección **Reserva: entrada, política de precio e idempotencia** (H2, runbook V13, override, taxonomía YAML, Tx-A/Tx-B).
3. Full `git diff origin/integration/storecore-int...HEAD` and `git log origin/integration/storecore-int..HEAD --oneline`.
4. Changed product paths: `V13__posc003e_request_hash_algorithm.sql`, `BlackStoreSagaPolicy.kt`, `RequestHashAlgorithm.kt`, `JdbcBlackStoreSagaEngine.kt`, `PriceOverrideAttempt.kt`, `BlackStoreIntegrationService.kt`, `BlackStoreSagaPort.kt`, `BlackStoreIntegrationController.kt`, tests `Posc003eReserveH2Test.kt`, `Posc002fAcceptanceMatrixTest.kt`, `BlackStoreSagaEngineTest.kt`, plus SDD pointers in `STATUS.md`, `tasks.json`, `progress.md`.

Maven was **not** run (review instruction).

## SDD why

POSC-003E closes the catalog/reserve DAG started in 003A–D: additive Flyway for `request_hash_algorithm`, H2 hashes on new reserves, YAML-exact error taxonomy on `POST /reservations`, and audited stale-catalog/price override via the 003A `storecore_blackstore_audit_override` function and bearer scope `price:override`. Commit/release/GET/reconcile (004), worker/purge (004A), fiscal, ML RR, and live companion stay deferred. `BLACKSTORE_INTEGRATION` must remain `DISABLED` outside temporary test SQL.

## Diff judged

Net paths (product + SDD only):

```text
backend/src/main/kotlin/com/storecore/blackstore/BlackStoreSagaPolicy.kt
backend/src/main/kotlin/com/storecore/blackstore/JdbcBlackStoreSagaEngine.kt
backend/src/main/kotlin/com/storecore/blackstore/PriceOverrideAttempt.kt
backend/src/main/kotlin/com/storecore/blackstore/application/BlackStoreIntegrationService.kt
backend/src/main/kotlin/com/storecore/blackstore/application/port/BlackStoreSagaPort.kt
backend/src/main/kotlin/com/storecore/blackstore/domain/RequestHashAlgorithm.kt
backend/src/main/kotlin/com/storecore/blackstore/infrastructure/web/BlackStoreIntegrationController.kt
backend/src/main/resources/db/migration/V13__posc003e_request_hash_algorithm.sql
backend/src/test/kotlin/com/storecore/blackstore/Posc003eReserveH2Test.kt
backend/src/test/kotlin/com/storecore/blackstore/Posc002fAcceptanceMatrixTest.kt
backend/src/test/kotlin/com/storecore/blackstore/BlackStoreSagaEngineTest.kt
backend/src/test/kotlin/com/storecore/blackstore/BlackStoreIntegrationServiceTest.kt
sdd/STATUS.md
sdd/wip/20260927-pos-integration-convergence/3-tasks/posc003-implementation-slices.md
sdd/wip/20260927-pos-integration-convergence/3-tasks/tasks.json
sdd/wip/20260927-pos-integration-convergence/4-implementation/progress.md
```

No `frontend/`, OpenAPI pin change, fiscal/ARCA, ML adapter, live connector, commit/release handler rewrite, worker/purge, `V14`, or POSC-004 artifact.

## Confirmation checklist (scope)

| Check | Result |
| --- | --- |
| V13 additive `request_hash_algorithm` DEFAULT `H1` | **PASS.** `V13__posc003e_request_hash_algorithm.sql` adds `NOT NULL DEFAULT 'H1'` and `CHECK (request_hash_algorithm IN ('H1','H2'))`. Does not rewrite V1–V12. Pinned SHA `AA96A42978F81D5F2AAE910C18083C262DE9F5B635BBBF922C35F83BD725ED23` in `Posc003eReserveH2Test` and `Posc002fAcceptanceMatrixTest`. |
| New reserves persist H2 | **PASS.** `claimPending` inserts `request_hash_algorithm='H2'` and hashes with `BlackStoreSagaPolicy.requestHashH2`. Existing H1 rows backfilled by DEFAULT. `hashMatches` replays H1/H2 separately. |
| Live PENDING &lt;60s aborts migrate | **PASS.** V13 preflight `DO $$ … RAISE EXCEPTION 'POSC-003E abort: live PENDING within 60 seconds'` when `state='PENDING' AND created_at > clock_timestamp() - interval '60 seconds'`. |
| No `LINE_VALIDATION_FAILED` / `DUPLICATE_VARIANT` / `COST_SCOPE_REQUIRED` on reserve path | **PASS.** Reserve path emits `VALIDATION`, `INSUFFICIENT_STOCK`, `CATALOG_VERSION_STALE`, etc. `BlackStoreSagaEngineTest` duplicate-variant expectation updated to `VALIDATION`. Repo grep on changed backend: zero emitters for the three forbidden codes. `includeCost` on catalog still maps to `FORBIDDEN` via `costForbidden()`, not `COST_SCOPE_REQUIRED`. |
| Envelope `priceVersion` empty → 400 pre-Tx-A | **PASS.** `BlackStoreIntegrationService.reserve` resolves line price from envelope default; empty envelope + empty line → `BlackStoreSagaException.validation()` before saga. Covered in `Posc003eReserveH2Test.yamlTaxonomyRejectsEmptyPriceDuplicateAndLongSku`. |
| Override via `storecore_blackstore_audit_override` + scope `price:override` | **PASS.** `authorizeOverride` requires `CompanionScope.PRICE_OVERRIDE`, validates reason 3..500 and optional role, calls `SELECT public.storecore_blackstore_audit_override(...)` for ALLOWED/DENIED. Controller wires `X-Override-Reason` / `X-Actor-Role`. Scope-denied path tested (`BlackStoreForbidden`). |
| Stale catalog still requires override (even if line prices current) | **PASS.** Tx-B uses `catalogStale \|\| priceStale`; either flag invokes `authorizeOverride`. No silent waiver when only prices match. Stale-only case returns `CATALOG_VERSION_STALE` without override (tested). |
| No commit/release/004 scope | **PASS.** Diff does not implement POSC-004 commit/release/GET/reconcile behavior changes; only reserve Tx-A/Tx-B, H2, override, and taxonomy cleanup. Pre-existing commit/release endpoints untouched. |
| No fiscal / ML / live | **PASS.** No fiscal, ML, or live-connector paths in the diff. |
| `BLACKSTORE_INTEGRATION` stays DISABLED except test SQL | **PASS.** `Posc002fAcceptanceMatrixTest` still asserts module `DISABLED` after full Flyway through V13. `Posc003eReserveH2Test` activates temporarily inside Testcontainers only (same pattern as prior POS slices). Production bootstrap unchanged. |

## Scope checks (boundary)

| Check | Result |
| --- | --- |
| Depends on 003D merged (`eb59fb7`) | **PASS.** Branch base is integration head after 003D. |
| One handler `POST /reservations` (no 004 routes) | **PASS.** Only reserve wiring extended with override headers; commit/release mappings unchanged. |
| Flyway head V13 only (no V14) | **PASS.** Single new migration `V13__posc003e_request_hash_algorithm.sql`. |
| No shared-runtime / tenancy / frontend deps | **PASS.** |
| SDD docs honest about gate | **PASS.** `STATUS.md`, `tasks.json`, `progress.md` mark 003E local pending dual Grok; 004 NO-GO until 003E merge. |
| Tx-A / Tx-B split preserved (crash A→B) | **PASS.** `claimPending` + `finishReserve` remain separable; existing `BlackStoreSagaEngineTest` covers visible PENDING and finish. |
| H1 implicit rows + H2 new rows coexist | **PASS.** DEFAULT `H1` for V6 rows; INSERT uses `H2`; `RequestHashAlgorithm.fromWire(null\|"")` → H1. |

## Validations

| Check | Result |
| --- | --- |
| Diff name-only and commit list | **PASS**, 2026-09-30. One commit `840f5cb`. Merge-base `eb59fb7`. |
| Maven / Testcontainers | **Not run** (review instruction). Local evidence relies on static review + existing/adjusted tests in diff; SDD lane should run PG16 suite before merge. |
| GitHub CI | **Not evaluated as green.** Hosted Verify billing/spending-limit exception remains the project norm; not claimed pass here. |

## Standards

Closed-domain types: `RequestHashAlgorithm` sealed with `fromWire` and `Unknown`. Reserve errors flow through `BlackStoreSagaException` codes aligned to YAML, not raw strings in the view layer. Override audit goes through the 003A SECURITY DEFINER function, not direct `audit_events` INSERT. No new frontend or architecture boundary violations.

## Gaps

**None blocking for scope.**

Non-blocking (SDD / evidence lane may tighten):

1. **V13 live-PENDING abort** — SQL guard present; no Testcontainers test inserts a &lt;60s PENDING and asserts migrate failure.
2. **Override ALLOWED + audit row** — DENIED without scope is tested; no test proves ALLOWED path, `audit_events` row, or successful reserve under stale catalog with valid override + owned quotes.
3. **Stale catalog + fresh line prices** — logic is in `finishReserve` (`catalogStale \|\| priceStale`); no dedicated test where prices match live but `catalogVersion` is old and override is required.
4. **Audit payload fidelity** — `auditOverride` JSON uses `quadruple.operationId` as `catalogRequested` and `principal.serviceRole` as `declaredRole` instead of requested catalog version and `X-Actor-Role` claim; does not expand scope but may miss proposal audit fields.
5. **Proposal capability `PRICE_OVERRIDE`** — slice confirmation for this review asked scope `price:override` + audit function only; module capability gate is not wired in `authorizeOverride` (same pattern as pre-003E reserve paths).

## Residual NO-GO

POSC-004 commit/release/GET/reconcile, POSC-004A worker/purge, fiscal/ARCA, BlackStore live companion, ML RR, tag, deploy, publish, and `/sdd.finish` stay outside this slice. Merge requires dual Grok APPROVED (this scope file + SDD lane) and honest close-out; this verdict alone does not authorize merge.
