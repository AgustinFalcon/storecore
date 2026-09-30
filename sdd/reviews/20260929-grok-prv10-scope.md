VERDICT: APPROVED

# Grok 4.7 — POSC-002D scope/ACL review (SCOPE lane)

**Date:** 2026-09-29 (re-review)  
**Lane:** SCOPE  
**Feature:** POSC-002D — bearer opaco y principal en frontera HTTP  
**Branch:** `feature/posc002d-companion-bearer` @ `37b1621` (merge base) plus **uncommitted working-tree delta** containing all 002D product code and tests  
**PR:** none yet  
**Integration head (committed):** `37b1621` (`Merge pull request #67 … POSC-002C V9 companion admin schema`)  
**Reviewed against:** `sdd/wip/20260927-pos-integration-convergence/3-tasks/posc002-implementation-slices.md` (POSC-002D), `sdd/wip/20260927-pos-integration-convergence/2-technical/posc002-identity-acl-proposal.md` (bearer/error matrix/scopes)  
**No merge.** This file does not approve GitHub, does not call CI green, does not authorize deploy/tag/push, and does not authorize `/sdd.finish`.

## What was read

1. POSC-002D slice ownership and acceptance (`posc002-implementation-slices.md` § POSC-002D).
2. Pinned error matrix, scope table, bearer/provider semantics (`posc002-identity-acl-proposal.md` § Identidad de servicio, Matriz de rutas, Error matrix).
3. Full uncommitted delta on `feature/posc002d-companion-bearer`: interceptor, verifier, closed domain types, route matrix, in-memory provider, JDBC lookup, web config, HTTP/unit tests, and minimal edits to `BlackStoreIntegrationService`, `BlackStoreFailClosedHttpTest`, `BlackStoreHttpContractTest`.
4. **Re-review:** updated `Posc002dCompanionAuthHttpTest.bearerMatrixKeepsOpenApiPublicAndHidesSecrets` with HTTP rows for prior gaps G1–G4.
5. Confirmed `backend/src/main/resources/openapi/blackstore-integration.openapi.yaml` has **zero byte diff** vs `HEAD`. `BlackStoreOpenApiBaselineContractTest` still pins digest `7B907A2E11C52A66B7253407FB3F9450CAE7B792BECCF34C1636BE9D3945DE30`.
6. Flyway inventory: V1–V9 present. **No V10.** No `pos_companion_*` guard functions in product code (correct for 002D; guards belong to 002E).

## SDD why (002D)

POSC-002D adds HTTP-boundary companion authentication: opaque ≥256-bit bearer, fingerprint lookup + constant-time secret compare, immutable `VerifiedCompanionPrincipal`, scope matrix on the seven business routes, pinned error envelopes, and OpenAPI exception without YAML mutation. Engine/guard wiring and principal transport into Tx-A/Tx-B remain POSC-002E.

## Scope checklist

| Requirement | Code | Tests | Result |
| --- | --- | --- | --- |
| Closed types `CompanionScope`, `CompanionServiceRole` (and lifecycle) with `fromWire` → `Unknown` | PASS | PASS — `CompanionScopeTest` | PASS |
| Token ≥256 bits; fingerprint selects row; `MessageDigest.isEqual` authenticates | PASS | PASS — `CompanionCredentialVerifierTest` | PASS |
| Legacy `auth_ready=false` → Invalid → 401 | PASS | PASS — unit `legacyActiveWithoutAuthReadyStaysInvalid` | PASS |
| Missing / malformed / unknown / revoked bearer → 401 `UNAUTHORIZED` | PASS | PASS — HTTP: missing, header-only, non-hex, short hex, unknown bytes, revoked credential | PASS |
| Provider `TransientFailure` after ref identified → 500 `INTERNAL` retryable | PASS | PASS — unit + HTTP outage row | PASS |
| Binding mismatch / DISABLED companion / missing scope → 403 `FORBIDDEN` | PASS | PASS — HTTP: binding mismatch, DISABLED companion, catalog-only on stock route | PASS |
| `includeCost=true` → 403 `COST_SCOPE_REQUIRED` even with `catalog:read` | PASS | PASS — `Posc002dCompanionAuthHttpTest`, `BlackStoreHttpContractTest` | PASS |
| `GET /openapi.yaml` without bearer → 200; digest/owner unchanged | PASS | PASS — HTTP + offline digest test | PASS |
| `X-Client-Instance-Id` does not create identity | PASS | PASS — HTTP header-only without `Authorization` → 401 | PASS |
| In-memory provider is synthetic test fixture; no live secrets in repo | PASS | PASS — `test-only:` / `synthetic:` refs | PASS |
| No Flyway V10; no POS SQL guards in this cut | PASS | N/A | PASS |
| `CompanionAuthInterceptor`, `DefaultCompanionCredentialVerifier`, `Posc002dCompanionAuthHttpTest`, `FailClosed` + `HttpContract` regression | PASS | PASS | PASS |

## G1–G4 disposition (re-review)

| Gap | Requirement | Test evidence | Status |
| --- | --- | --- | --- |
| **G1** | Missing scope → 403 `FORBIDDEN` | `catalogOnly` seeded with `catalog:read` only; `GET /stock/variants/1` → 403/`FORBIDDEN` (L60–62) | **CLOSED** |
| **G2** | Revoked credential → 401 `UNAUTHORIZED` | Credential `UPDATE status='REVOKED'` by fingerprint; same bearer → 401/`UNAUTHORIZED` (L64–67) | **CLOSED** |
| **G3** | Malformed bearer → 401 `UNAUTHORIZED` | Non-hex token and 16-char hex (`ab`×8, &lt;256 bits) → 401/`UNAUTHORIZED` (L45–48) | **CLOSED** |
| **G4** | Header alone must not authenticate → 401 | `X-Client-Instance-Id` only, no `Authorization` → 401/`UNAUTHORIZED` (L41–43) | **CLOSED** |

## Implementation notes (informational, non-blocking)

- `VerifiedCompanionPrincipal` is stored on the request (`REQUEST_ATTR`) but controllers/services still read `X-Client-Instance-Id` and call legacy `BlackStoreCompanionGuard.assertBound`. Safe while interceptor runs first; full principal transport to saga/read ports is POSC-002E.
- `BlackStoreWebConfig` registers the interceptor on `/blackstore-integration/v1/**`; OpenAPI bypass is inside the interceptor—acceptable.

## Recorded validation (not CI)

| Run | Command / scope | Result | Timestamp |
| --- | --- | --- | --- |
| 1 | Focused unit slice (4 tests) | BUILD SUCCESS | 2026-09-29T22:29:25-03:00 |
| 2 | Expanded focused slice (13 tests) | BUILD SUCCESS | 2026-09-29T22:30:38-03:00 |
| 3 | `mvn "-Dtest=Posc002dCompanionAuthHttpTest" test` — 1 test, 0 failures | BUILD SUCCESS | recorded re-review pass |

Maven was **not** re-run during this re-review (per instructions). Recorded passes are local—not GitHub CI green.

## Residual gates (out of 002D SCOPE lane)

- POS companion effect/read SQL guards and `VerifiedCompanionPrincipal` through `JdbcBlackStoreSagaEngine` — POSC-002E.
- Full PG16/HTTP acceptance matrix (002F), dual Astra merge gate, live provider/pool — later slices.
- ML `REPEATABLE READ` admin-wins — separate NO-GO per proposal.

## Summary

POSC-002D SCOPE lane **APPROVED**. All pinned acceptance items have code and test evidence; prior gaps G1–G4 are closed in `Posc002dCompanionAuthHttpTest`. OpenAPI bytes unchanged; no V10 or POS guards. This verdict is scope-only—no merge, no GitHub approve, no `/sdd.finish`.
