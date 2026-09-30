VERDICT: APPROVED

# Grok 4.7 — POSC-005 scope / implementation

**Lane:** SCOPE / implementation
**Task:** TASK-POSC-005 — wire, topología y cierre offline
**GitHub base:** `origin/integration/storecore-int` @ `dc23b45` (POSC-006 merge #82)
**Branch:** `feature/posc005-wire-topology` @ `56976db` (`Certify offline POS wire: unique routes, pinned OpenAPI HTTP, BaseResponse 401.`)
**Reviewed diff:** `git diff origin/integration/storecore-int...HEAD` (`dc23b45...56976db`), one commit, 6 files, +127 / −8
**No merge.** This file does not approve GitHub, does not call CI green, does not authorize live, fiscal, or `/sdd.finish`.

## What was read (in order)

1. `sdd/wip/20260927-pos-integration-convergence/3-tasks/plan.md` — Corte 5 (wire/topología offline; envelope, OpenAPI, Spring maps; instalación DISABLED; suite backend; dos reviews sin P0–P2; live/fiscal/`sdd.finish` NO-GO).
2. `sdd/wip/20260927-pos-integration-convergence/3-tasks/posc005-implementation-slices.md` — alcance, fuera, Luna attestation table, residuales explícitos.
3. `sdd/STATUS.md` — integración en `dc23b45`; POSC-006 merged; POSC-005 en progreso; residuales DAG honestos.
4. Full `git diff origin/integration/storecore-int...HEAD`. **Zero** production Kotlin, Flyway, ACL, or `pom.xml`.
5. `backend/src/test/kotlin/com/storecore/blackstore/Posc005WireTopologyTest.kt` in full.
6. Production context (unchanged by diff): `BlackStoreIntegrationController.kt`, `CompanionAuthInterceptor.kt`, `BlackStoreIntegrationExceptionAdvice.kt`, `BlackStoreWebConfig.kt`.

## SDD why

Corte 5 closes offline wire certification after PIC-006A and worker/purge. POSC-005 depends on TASK-POSC-004A and TASK-POSC-006 (both merged). This slice certifies Spring route ownership, HTTP-served OpenAPI with the adjudicated digest, module DISABLED, and the 401 error envelope on an unauthenticated catalog GET. Rate limits stay covered by prior `BlackStoreHttpContractTest` / `BlackStoreRateLimiterTest`. DAG residuals (`INSERT(variant_id)` false, 004A-R01/R02, ML RR, PIC-008A, fiscal, live) are outside 005. STATUS refuses live companion, fiscal/ARCA, and `/sdd.finish`.

## Diff judged

```text
CHANGELOG.md
backend/src/test/kotlin/com/storecore/blackstore/Posc005WireTopologyTest.kt
sdd/STATUS.md
sdd/wip/20260927-pos-integration-convergence/3-tasks/posc005-implementation-slices.md
sdd/wip/20260927-pos-integration-convergence/3-tasks/tasks.json
sdd/wip/20260927-pos-integration-convergence/4-implementation/progress.md
```

No `backend/src/main/**`, no Flyway, no ACL, no `pom.xml`, no frontend, no `.github`.

## Scope checks

| Check | Result |
| --- | --- |
| Zero production Kotlin/Flyway/ACL/pom | PASS. Diff is test-only plus SDD/CHANGELOG. |
| `@SpringBootTest` `RANDOM_PORT` | PASS. Line 20: `webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT`, `storecore.installation-guard.enabled=false`. |
| Seven business routes + `openapi.yaml` unique in `RequestMappingHandlerMapping` | PASS. Expected set: catalog, stock, reserve, commit, release, GET operation, reconcile, openapi (8 handlers). Filters `/blackstore-integration/v1` paths; `assertEquals(expected, owned.map { it.first }.toSet())` and `assertEquals(expected.size, owned.size)` reject duplicates. |
| Single owner `BlackStoreIntegrationController` | PASS. `assertTrue(owned.all { it.second == "BlackStoreIntegrationController" })`. Grep of `backend/src/main/kotlin` shows only one controller under `/blackstore-integration/v1`. |
| HTTP GET `/blackstore-integration/v1/openapi.yaml` → 200 | PASS. `http.getForEntity(..., ByteArray::class.java)` asserts status 200. |
| `X-Contract-Version: 1.0.0-draft` | PASS. Header asserted on HTTP response. Matches controller `openApi()` and adjudicated pin. |
| SHA-256 over HTTP bytes | PASS. `assertEquals(PINNED_OPENAPI_SHA256, sha256(openApi.body!!))` with `7B907A2E11C52A66B7253407FB3F9450CAE7B792BECCF34C1636BE9D3945DE30`. Asserts wire bytes, not classpath-only. |
| Module `BLACKSTORE_INTEGRATION` DISABLED | PASS. JDBC `SELECT state FROM module_configurations WHERE module_code='BLACKSTORE_INTEGRATION'` → `DISABLED`. |
| GET catalog without bearer → 401 envelope | PASS. `http.exchange("/blackstore-integration/v1/catalog", GET, null, ...)` → 401. JSON asserts `code=401`, `data` missing/null, `errorCode=UNAUTHORIZED`, `retryable=false`, non-blank `traceId` and `message`. Matches `BlackStoreUnauthorized` → `BlackStoreIntegrationExceptionAdvice` → `BlackStoreErrorEnvelope` (same wire shape as `BaseResponse`). |
| No live activation | PASS. Test reads DISABLED; no SQL enable, no secrets, no conector. |
| Rate limits in this slice | N/A (deferred). Slices document prior coverage; not a 005 P0. |

## Validations

| Check | Result |
| --- | --- |
| Diff name-only | PASS, 2026-09-30. Six paths above; one commit `56976db`. |
| `mvn -Dtest=Posc005WireTopologyTest test` | **Luna attestation** in `posc005-implementation-slices.md`: exit 0, 1 run / 0 failures, Flyway ceiling V14, PG 16 Testcontainers. **Not re-run by this reviewer** (instruction 4). Not CI green. |
| Full backend suite | **Not executed**; honestly documented in slices.md and plan Corte 5 residual. Not a 005 P0 per review charter. |
| GitHub / hosted Verify | **Not CI green.** Not evaluated as pass. |

## Standards

Test follows existing POS PG16 Spring harness pattern (`Posc006aGetReconcileRoTest`, `Posc001` family): Testcontainers `postgres:16-alpine`, `@DynamicPropertySource`, `TestRestTemplate`, `storecore.installation-guard.enabled=false`. Route inspection uses `@Qualifier("requestMappingHandlerMapping")` consistent with POSC-001 harness style. No new production surface; closed-domain states unchanged.

`BlackStoreErrorEnvelope` is the established BlackStore error wire type (not the identity `BaseResponse` class); fields align with OpenAPI `ErrorResponse401` and the slice’s envelope requirement.

## Gaps

None requiring code change for this slice. Full backend suite re-run remains a documented residual for a later gate, not a blocker when production is untouched and the focused test asserts SHA over HTTP, unique owners, and the 401 envelope.

## Residual NO-GO (not 005 P0)

- Runtime `INSERT(variant_id)` on `inventory_balances` false.
- 004A-R01 retry/poison, 004A-R02 race matrix.
- ML RR / TASK-DSP-000B.
- PIC-008A SKU 128/129, 400 dirty duplicates.
- Full backend suite not re-run on this branch.
- Fiscal/ARCA, BlackStore live companion, secrets, tag, deploy, publish, `/sdd.finish`.
- Hosted Verify `steps=[]` is not CI green.

## P0 / P1

**P0:** none.

**P1:** none for merge of this test-only slice. Full backend suite re-run is an honest documented residual outside 005 scope; known DAG residuals above stay NO-GO but are not POSC-005 P0s.
