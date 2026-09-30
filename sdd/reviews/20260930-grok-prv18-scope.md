VERDICT: APPROVED

# Grok 4.7 — POSC-003B price quote (SCOPE lane)

**Lane:** SCOPE  
**Feature:** POSC-003B — `catalogVersion` / `priceVersion` and `PriceQuotePort`  
**Base:** `6cc7ffa` (`Merge pull request #75 … POSC-003A catalog revision`)  
**Branch:** `feature/posc003b-price-quote`  
**Reviewed tree:** working tree at review time (uncommitted); `git rev-parse HEAD` == `6cc7ffa` (no commits ahead of base)  
**No merge.** This file does not approve GitHub, does not call hosted Verify CI green, does not authorize deploy/tag/secrets/publish, does not unlock 003C–E, and does not authorize `/sdd.finish`.

## What was read (required order)

1. `sdd/wip/20260927-pos-integration-convergence/3-tasks/posc003-implementation-slices.md` — POSC-003B ownership, acceptance, ordered DAG 003A→E.  
2. `sdd/wip/20260927-pos-integration-convergence/2-technical/posc003-catalog-reserve-proposal.md` — §Modelo `c1_`/`p1_`, half-open offer window, unified `PriceQuotePort`, `includeCost` fail-closed.  
3. Full diff vs base: `git diff 6cc7ffa` (13 modified paths) + `git status` (9 untracked product paths).  
4. `JdbcPriceQuoteAdapter.kt`, `PriceQuotePort.kt`, domain types `CatalogVersion`, `PriceVersion`, `OfferWindow`, `PriceQuote`, `VersionDigest`.  
5. Callers: `JdbcBlackStoreCatalogQuery.kt`, `JdbcBlackStoreSagaEngine.kt` (Tx-B price check), `JdbcEffectivePriceQueryAdapter.kt`, `CatalogService.kt` (storefront offer filter).  
6. Tests: `Posc003bCatalogVersionTest.kt`, `Posc003bPriceQuoteTest.kt`, `BlackStoreSagaEngineTest.kt` (catalog + reserve paths), `CatalogEffectiveOfferTest.kt`, `BlackStoreHttpContractTest.kt` (`includeCost`).

## SDD why

POSC-003B must stop hardcoded `catalog-<productId>` / `products.base_price` divergence between BlackStore catalog, Tx-B validation, and storefront effective pricing. One `PriceQuotePort` with canonical half-open offer selection `[starts_at, ends_at)` and closed wire types `c1_` / `p1_` governs all three surfaces. `catalogVersion` derives from revision singleton (003A) plus currency and ACTIVE offer IDs at DB `asOf`. `includeCost=true` stays fail-closed with a YAML-pinned 403 code, not `COST_SCOPE_REQUIRED`. Cursor/snapshot/ETag (003C), stock handler split (003D), H2 reserve (003E), fiscal/live/ML/`sdd.finish` remain out of scope.

## Diff judged

**Modified (13):** `BlackStoreSagaPolicy.kt`, `JdbcBlackStoreCatalogQuery.kt`, `JdbcBlackStoreSagaEngine.kt`, `CatalogService.kt`, `EffectivePrice.kt`, `JdbcEffectivePriceQueryAdapter.kt`, saga/catalog HTTP tests (`BlackStoreSagaEngineTest`, `BlackStoreHttpContractTest`, `Posc002dCompanionAuthHttpTest`, `Posc002fAcceptanceMatrixTest`), SDD pointers (`STATUS.md`, slices, `tasks.json`).

**Added (9):** `PriceQuotePort.kt`, `JdbcPriceQuoteAdapter.kt`, `VersionDigest.kt`, domain `CatalogVersion` / `PriceVersion` / `OfferWindow` / `PriceQuote`, tests `Posc003bCatalogVersionTest` / `Posc003bPriceQuoteTest`.

No Flyway delta, no OpenAPI rewrite, no frontend, no `.github`, no activation of `BLACKSTORE_INTEGRATION`.

## Scope IN checks

| Check | Result |
| --- | --- |
| Closed `c1_` / `p1_` wire types with `fromWire` → `Unknown` | **PASS.** `CatalogVersion` / `PriceVersion` sealed types; regex `^c1_[A-Za-z0-9_-]{43}$` and `^p1_[A-Za-z0-9_-]{43}$`; unit tests reject legacy `catalog-*` wire. |
| Single `PriceQuotePort` | **PASS.** New port + `JdbcPriceQuoteAdapter`; injected into catalog query, saga engine, effective-price adapter. |
| Half-open offer window `[starts_at, ends_at)` | **PASS.** `OfferWindow.SQL` = `starts_at <= ? AND ? < ends_at`; LATERAL selector `priority DESC, id ASC`; `Posc003bPriceQuoteTest` proves `asOf == ends_at` drops offer (100 vs 80); `CatalogService.search` offers filter migrated from closed `BETWEEN` to half-open. |
| `catalogVersion` from revision + currency + ACTIVE offer IDs at `asOf` | **PASS.** `catalogVersion()` reads `blackstore_catalog_revision.revision`, installation currency, ordered offer IDs via `OfferWindow.SQL`; digest via length-prefixed SHA-256 base64url → `c1_` + 43 chars (46 total). Callers invoke `shareRevision()` before version/quote (003A lock). |
| POS catalog, storefront, Tx-B share same selector | **PASS.** `JdbcBlackStoreCatalogQuery` quotes page rows via `quoteByVariantIds(asOf, …)`; `JdbcEffectivePriceQueryAdapter` delegates to `quoteBySkus`; `finishReserve` re-quotes under same `asOf` after `shareRevision()` and compares `line.priceVersion` to live `p1_` wire. `Posc003bPriceQuoteTest` asserts POS == storefront effective + `priceVersion`. |
| `includeCost` → `FORBIDDEN` (YAML pin) | **PASS.** `BlackStoreSagaPolicy.costForbidden()` now emits `FORBIDDEN` 403 (was `COST_SCOPE_REQUIRED`). Guard at `JdbcBlackStoreCatalogQuery.readPage` and `BlackStoreIntegrationService.catalog`. `BlackStoreSagaEngineTest` and `BlackStoreHttpContractTest` assert 403/`FORBIDDEN`. |
| Tests 003B + saga/catalog offer | **PASS (local).** See Validations. |

## Scope OUT checks (no leak)

| Deferred slice | Leak? | Evidence |
| --- | --- | --- |
| 003C cursor / snapshot / `e1_` ETag | **None** | Legacy cursor token (`variantId.uuidV5`) and `etag=catalogVersion.take(64)` unchanged; no `blackstore_catalog_page_snapshots`, no `blackstore_price_quotes`, no cursor column deltas, no `e1_` digest. |
| 003D stock handler split | **None** | `readStock` remains on `JdbcBlackStoreCatalogQuery`; no new controller/handler. |
| 003E H2 reserve / `request_hash_algorithm` | **None** | `BlackStoreSagaPolicy.requestHash` unchanged H1-style; no Flyway ALTER; pre-existing `DUPLICATE_VARIANT` / `LINE_VALIDATION_FAILED` paths untouched (003E taxonomía). |
| 004 / 004A / fiscal / BlackStore live / ML pricing / `sdd.finish` | **None** | No paths touched beyond honest SDD pointer updates. |

## Validations

| Check | Result |
| --- | --- |
| Diff inventory vs `6cc7ffa` | **PASS.** 13 modified + 9 untracked product files; zero commits on branch tip. |
| Focused Maven (PG16 Testcontainers) | **PASS (local, 2026-09-30).** From `backend/`: `mvn -Dtest=Posc003bCatalogVersionTest,Posc003bPriceQuoteTest,BlackStoreSagaEngineTest,CatalogEffectiveOfferTest test` → exit **0**, BUILD SUCCESS (~104s). Local only; **not CI green.** |
| Hosted Verify CI | **Not run / not green.** No GitHub check invoked for this uncommitted tree; billing `steps=[]` failures elsewhere are not a pass. |

## Implementation notes (non-blocking)

- **Tx-B stale on price drift:** `PRICE_VERSION_MISMATCH` line failure removed; non-`p1_` or mismatched live quote → 422 `CATALOG_VERSION_STALE` with claim delete — aligns with 003B pricing contract; full YAML line taxonomy deferred to 003E.  
- **`generatedAt`:** catalog page still uses JVM `Instant.now()` while quotes use DB `clock_timestamp()` — pre-003C snapshot semantics; not a POS/storefront price divergence.  
- **`pageSize`:** `coerceIn(1, 200)` remains; strict 400 for 0/201 is 003C.  
- **Storefront fallback `priceVersion`:** when no quote, wire still `"catalog"` string — acceptable at USER boundary until quotes always present for listed SKUs.

## Findings

### P0 — none open

No scope leak into 003C–E. No P0 pricing bug: half-open boundary, unified port, and Tx-B re-quote match spec intent. `includeCost` correctly pinned to `FORBIDDEN`.

### Residual (honest, out of 003B verdict)

Legacy cursor/ETag, page-size validation, H2/idempotency taxonomy, price-override audit flow, and batch cleanup stay on 003C–E / 004A gates. `BLACKSTORE_INTEGRATION` remains DISABLED. Dual lane needs paired SDD review + both APPROVED before merge.

## Gaps

None blocking for POSC-003B scope merge readiness.
