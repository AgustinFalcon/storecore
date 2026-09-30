VERDICT: APPROVED

# Grok 4.7 — POSC-003E scope (prv21 r2)

**Lane:** SCOPE  
**Feature:** POSC-003E — reserva Tx-A/Tx-B y hash H2  
**GitHub base:** `origin/integration/storecore-int` @ `eb59fb7` (POSC-003D stock read merge)  
**Branch:** `feature/posc003e-reserve-h2` @ `d0e33ff` (`Keep denied price-override audits after Tx-B rollback and require issued catalog evidence.`)  
**Reviewed diff:** `git diff origin/integration/storecore-int...HEAD` — two commits, 18 files, +921 / −45  
**Prior scope review:** `sdd/reviews/20260930-grok-prv21-scope.md` APPROVED @ `840f5cb`; this r2 re-checks after P0 override follow-up `d0e33ff`.  
**No merge.** This file does not approve GitHub, does not call CI green, does not authorize `/sdd.finish`, does not unlock 004, and does not enable live BlackStore traffic.

## What was read

1. `sdd/wip/20260927-pos-integration-convergence/3-tasks/posc003-implementation-slices.md` — slice **POSC-003E** (ownership, dependencia 003D, aceptación) and **Fuera de este DAG**.
2. `sdd/wip/20260927-pos-integration-convergence/2-technical/posc003-catalog-reserve-proposal.md` — §Reserva (H2, runbook V13, override audit, taxonomía YAML, Tx-A/Tx-B; reserva ownership: one `POST /reservations` handler; no commit/release/worker).
3. First-pass scope review `sdd/reviews/20260930-grok-prv21-scope.md` (APPROVED @ `840f5cb`).
4. Full `git diff origin/integration/storecore-int...HEAD` and `git log origin/integration/storecore-int...HEAD --oneline`.

```text
d0e33ff Keep denied price-override audits after Tx-B rollback and require issued catalog evidence.
840f5cb Add H2 reservation hashes and drop YAML-absent reserve codes.
```

## SDD why

POSC-003E closes the catalog/reserve DAG started in 003A–D: additive Flyway V13 for `request_hash_algorithm`, H2 hashes on new reserves with H1 replay preserved, YAML-exact error taxonomy on the existing `POST /reservations` handler, and audited stale-catalog/price override via the 003A `storecore_blackstore_audit_override` function and `PRICE_OVERRIDE` companion guard. Follow-up `d0e33ff` closes P0 override gaps (durable DENIED audit, PENDING delete on override 400/422, payload fidelity, cursor/snapshot evidence) without leaving the slice. Commit/release/GET/reconcile (004), worker/purge (004A), fiscal, ML RR, and live companion stay deferred. `BLACKSTORE_INTEGRATION` must remain `DISABLED` outside temporary test SQL.

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
sdd/reviews/20260930-grok-prv21-scope.md
sdd/reviews/20260930-grok-prv21-sdd.md
sdd/wip/20260927-pos-integration-convergence/3-tasks/posc003-implementation-slices.md
sdd/wip/20260927-pos-integration-convergence/3-tasks/tasks.json
sdd/wip/20260927-pos-integration-convergence/4-implementation/progress.md
```

No `frontend/`, OpenAPI pin change, fiscal/ARCA, ML adapter, live connector, commit/release handler rewrite, worker/purge batch, `V14`, POSC-004 artifact, or `/sdd.finish`.

## Scope checks

| Check | Result |
| --- | --- |
| V13 additive `request_hash_algorithm` DEFAULT `H1` | **PASS.** Single migration `V13__posc003e_request_hash_algorithm.sql`; CHECK `H1\|H2`; live PENDING &lt;60s abort; SHA pin `AA96A42978F81D5F2AAE910C18083C262DE9F5B635BBBF922C35F83BD725ED23`. No V1–V12 rewrite. |
| New reserves persist H2; H1 replay preserved | **PASS.** `claimPending` INSERT `request_hash_algorithm='H2'` + `requestHashH2`; `hashMatches` branches H1/H2; H1 RESERVED line equality for terminal states. |
| One handler `POST /reservations` only | **PASS.** Existing `@PostMapping("/reservations")` extended with override headers only. Commit/release/reconcile mappings unchanged. |
| YAML taxonomy (`VALIDATION`; no `DUPLICATE_VARIANT`/`LINE_VALIDATION_FAILED`/`COST_SCOPE_REQUIRED`) | **PASS.** Backend grep: zero emitters for forbidden codes. Duplicate variant → `VALIDATION`. Insufficient-only `lineFailures`. |
| Envelope `priceVersion` empty → 400 pre-Tx-A | **PASS.** Service resolves line/envelope price before saga; tested. |
| Override audit via `storecore_blackstore_audit_override` + `PRICE_OVERRIDE` guard | **PASS.** `decideOverride` calls `companionGuard.authorizeForEffect(principal, "PRICE_OVERRIDE")`; ALLOWED/DENIED via SECURITY DEFINER function; DENIED in `PROPAGATION_REQUIRES_NEW`; payload carries `X-Actor-Role`, requested catalog, reason, per-line versions. |
| Stale catalog + fresh line prices still requires override | **PASS.** `catalogStale \|\| priceStale` gate; dedicated test `catalogStaleWithLivePricesRequiresOverride`. |
| PENDING delete on override 400/422 | **PASS.** `ReasonInvalid`/`RoleInvalid`/`QuoteMissing`/`CatalogUnproven` paths call `deleteClaim`; tests assert zero ops where required. |
| Catalog cursor/snapshot evidence on stale override | **PASS.** `catalogIssuedToCompanion` reads existing 003C tables; `CATALOG_NOT_ISSUED` DENIED audit tested. Read-only evidence check, not PIC-006A reconcile cert. |
| Depends on 003D merged (`eb59fb7`) | **PASS.** Branch base is post-#78 integration head. |
| Flyway head V13 only | **PASS.** No `V14`. |
| No shared-runtime / tenancy / frontend deps | **PASS.** |
| Tx-A / Tx-B split preserved | **PASS.** `claimPending` + `finishReserve` remain separable; carry-over saga tests on H2. |
| SDD docs honest about gate | **PASS.** STATUS/slices/tasks/progress mark prv21 r2 pending; 004 NO-GO until 003E merge. |
| `BLACKSTORE_INTEGRATION` stays DISABLED except test SQL | **PASS.** `Posc002fAcceptanceMatrixTest` asserts DISABLED after V13; `Posc003eReserveH2Test` temporary ACTIVE inside Testcontainers only. |

## Out of scope (must remain outside)

| Boundary | Result |
| --- | --- |
| POSC-004 commit/release/GET/reconcile behavior | **PASS.** Pre-existing endpoints/methods untouched; diff does not implement 004 semantics. |
| POSC-004A worker/purge batch / expiry | **PASS.** No worker, scheduler, or purge batch added. |
| PIC-006A GET/reconcile RO cert | **PASS.** No reconcile certification surface added. |
| ML RR / TASK-DSP-000B admin-wins | **PASS.** Not touched. |
| Fiscal/ARCA, live BlackStore connector | **PASS.** Not in diff. |
| Grant `INSERT(variant_id)` on `inventory_balances` | **PASS.** No runtime grant or ACL change. |
| `/sdd.finish`, tag, deploy, secrets, publish | **PASS.** Not invoked or implied. |
| Hosted CI-green claim | **PASS.** Not claimed here. |

## Validations

| Check | Result |
| --- | --- |
| Diff name-only and commit list | **PASS**, 2026-09-30. Two commits `840f5cb`, `d0e33ff`. Merge-base `eb59fb7`. Head `d0e33ff`. 18 files, +921/−45. |
| Maven / Testcontainers | **Not run** (review instruction). Luna recorded `mvn -Dtest=Posc003eReserveH2Test,BlackStoreSagaEngineTest,BlackStoreIntegrationServiceTest` exit 0 after `d0e33ff`. |
| GitHub CI | **Not evaluated as green.** Hosted Verify billing/spending-limit exception remains project norm. |

## Standards

Closed-domain `RequestHashAlgorithm` with `fromWire`/`Unknown`. Override verdicts as internal enum; wire errors via `BlackStoreSagaException` YAML codes. Audit append-only through 003A SECURITY DEFINER function, not direct `audit_events` INSERT. No frontend or tenancy boundary violations.

## Gaps

**None blocking for scope.**

Non-blocking (SDD / evidence lane, not scope expansion):

1. V13 live-PENDING migrate-abort not exercised in Testcontainers.
2. H1 RESERVED line-replay fixture still untested after V13 backfill.
3. H2 golden hash vector / order-independence assertion absent.
4. SDD lane `20260930-grok-prv21-sdd.md` was `CHANGES_REQUIRED` @ `840f5cb`; r2 SDD lane must re-validate P0 fixes independently.

## Residual NO-GO

POSC-004 commit/release/GET/reconcile, POSC-004A worker/purge, PIC-006A, fiscal/ARCA, BlackStore live companion, ML RR, tag, deploy, publish, and `/sdd.finish` stay outside this slice. Merge requires dual Grok APPROVED (this scope r2 + SDD lane r2) and honest close-out; this verdict alone does not authorize merge or unlock 004.

## Merge posture

Scope lane **re-approves** after `d0e33ff`: P0 override follow-up stays within 003E acceptance (audit durability, guard, payload, issued-catalog evidence, tests) and does not expand into 004, fiscal, live activation, or finish. Await SDD lane r2 and dual APPROVED before any PR merge to `integration/storecore-int`.
