VERDICT: APPROVED

# Grok 4.7 — POSC-003C cursor / ETag / snapshot (SCOPE lane)

**Lane:** SCOPE  
**Feature:** POSC-003C — opaque cursor, page snapshot, quoted `e1_` ETag, quote retention  
**Base:** `origin/integration/storecore-int` @ `06a85e2` (POSC-003B merge `#76`)  
**Branch:** `feature/posc003c-cursor-etag` @ `89d56a0`  
**Reviewed diff:** `git diff origin/integration/storecore-int...HEAD` — 11 files, +605 / −57  
**No merge.** This file does not approve GitHub, does not call hosted Verify CI green, does not authorize deploy/tag/secrets/publish, does not unlock 003D–E, and does not authorize `/sdd.finish`.

## What was read (required order)

1. `sdd/wip/20260927-pos-integration-convergence/3-tasks/posc003-implementation-slices.md` — POSC-003C ownership, acceptance, ordered DAG 003A→E.  
2. `sdd/wip/20260927-pos-integration-convergence/2-technical/posc003-catalog-reserve-proposal.md` — §Modelo cursor opaco C1, fotografía durable, ETag `e1_`, 304 sobre fotografía viva, lazy delete, cotizaciones retenidas, stock fuera de `catalogVersion`.  
3. Full diff vs base: `git diff origin/integration/storecore-int...HEAD`.  
4. Production paths: `V12__posc003c_catalog_cursor_snapshot.sql`, `JdbcBlackStoreCatalogQuery.kt`, `BlackStoreIntegrationService.kt`, `CatalogCursorFormat.kt`.  
5. Tests: `Posc003cCursorEtagTest.kt`, bumps in `Posc002fAcceptanceMatrixTest` / `Posc003aCatalogRevisionTest`.  
6. Template: `sdd/reviews/20260930-grok-prv18-scope.md`, `sdd/reviews/20260930-grok-prv17-scope.md`.

## SDD why

POSC-003C replaces the manipulable legacy cursor (`<variantId>.<uuidV5>` prefix parse, TTL renewal on `ON CONFLICT`) and the page-blind ETag (`catalogVersion.take(64)`) with an opaque persisted C1 cursor, durable page snapshots, quoted strong `e1_` ETags, advisory-lock snapshot reuse, and `blackstore_price_quotes` retention for later override evidence. Stock read handler split (003D), H2 reserve taxonomy (003E), fiscal/live/ML, and `/sdd.finish` remain out of scope.

## Diff judged

**Modified (7):** `JdbcBlackStoreCatalogQuery.kt`, `BlackStoreIntegrationService.kt`, `Posc002fAcceptanceMatrixTest.kt`, `Posc003aCatalogRevisionTest.kt`, SDD pointers (`STATUS.md`, `posc003-implementation-slices.md`, `tasks.json`, `progress.md`).

**Added (4):** `V12__posc003c_catalog_cursor_snapshot.sql`, `CatalogCursorFormat.kt`, `Posc003cCursorEtagTest.kt`.

No OpenAPI rewrite, no frontend, no `.github`, no saga/reserve/H2 changes, no new HTTP route owners.

## Scope IN checks

| Check | Result |
| --- | --- |
| V12 additive only (no rewrite V1–V11) | **PASS.** New migration only; comment header states no V1–V11 edit; `ALTER TABLE blackstore_catalog_cursors` adds columns + LEGACY backfill + format CHECK; new tables `blackstore_catalog_page_snapshots`, `blackstore_price_quotes`. V11 checksum untouched. |
| Opaque C1 cursor (43 chars, CSPRNG base64url) | **PASS.** `opaqueToken()` → 32-byte `SecureRandom`, URL encoder without padding; INSERT stores `format_version='C1'` with `last_variant_id`, `page_size`, `visibility_digest`, `issued_at`. Test asserts token length 43. |
| No numeric prefix parse | **PASS.** Removed `cursor.substringBefore('.')` / `toLongOrNull()`; decode is exact DB lookup on `cursor_token` + `client_instance_id`. Legacy dotted token `"1.<uuid>"` → 410. |
| LEGACY / manipulated / crossed → 410 | **PASS.** Unknown token, `format_version != C1`, `last_variant_id IS NULL`, expiry, or mismatch on `catalogVersion` / `pageSize` / `visibility_digest` → `BlackStoreSagaException.cursorExpired()`. Test covers LEGACY backfill and dotted legacy wire. |
| `pageSize` 1..200, no clamp | **PASS.** Removed `coerceIn`; `JdbcBlackStoreCatalogQuery` and `BlackStoreIntegrationService.catalog` throw `VALIDATION` for `<1` or `>200`. Tests assert 0 and 201 → 400. |
| Snapshot + quotes + advisory lock | **PASS.** `inCatalogTx` + `pg_advisory_xact_lock` on companion/request/pageSize/visibility/contentDigest; `loadLiveSnapshot` reuse; `persistSnapshot` + `persistQuotes` in same transaction; generation keyed by UNIQUE(companion, request, view, digest, generation). |
| Quoted `e1_` ETag (48 chars) | **PASS.** `strongEtag()` returns `"e1_" + VersionDigest.sha256Url(...) + "\""`; test asserts prefix and length 48. |
| 304 only after auth + live snapshot | **PASS.** Service order: `requireEnabled` → companion bind → rate limit → pageSize/`If-None-Match` validation → `catalog.readPage` (live recompute + snapshot reuse) → `etagMatches` → `BlackStoreNotModified`. No short-circuit 304 before auth or before live read. |
| Stock change updates ETag, not `catalogVersion` | **PASS.** `Posc003cCursorEtagTest.stockChangeUpdatesEtagWithoutCatalogVersionAndLiveSnapshotIs304` updates `inventory_balances`, asserts same `catalogVersion`, different ETag. |
| `visibility_digest` + `format_version` persisted and verified | **PASS.** V12 columns; cursor INSERT/SELECT; decode compares stored digest to computed `visibilityDigest(clientInstanceId)`; test reads `char_length(visibility_digest)=64` and `format_version='C1'`. |
| Lazy delete after response | **PASS.** `lazyDeleteExpired(clientInstanceId)` in `finally` after catalog read (runs on success and on cursor 410 from `decodeCursor`). |
| Max 3 snapshot generations | **PASS.** `persistSnapshot` increments generation and returns without INSERT when `generation > 3`. |
| `includeCost` still FORBIDDEN | **PASS.** Unchanged guards in service and `readPage`; no new cost path. |
| Maven evidence recorded (not re-run here) | **PASS (recorded).** Slice doc: `Posc003cCursorEtagTest` 3/3; related suites exit 0 locally. Hosted Verify not treated as CI green. |

## Scope OUT checks (no leak)

| Deferred slice / gate | Leak? | Evidence |
| --- | --- | --- |
| 003D `GET /stock/variants/{variantId}` handler split | **None** | `readStock` unchanged; no SKU 65..128 filtering on stock path; no new stock controller. |
| 003E H2 reserve / `request_hash_algorithm` / YAML taxonomy | **None** | No edits to `JdbcBlackStoreSagaEngine`, `BlackStoreSagaPolicy.requestHash`, reservation DTOs, or saga DDL. |
| 004 / 004A commit-release / batch purge | **None** | No worker or purge batch logic added. |
| Fiscal / ARCA / BlackStore live / ML connector | **None** | Diff confined to catalog query, V12, tests, SDD pointers. |
| Activate `BLACKSTORE_INTEGRATION` | **None** | V12 header comment; `Posc002fAcceptanceMatrixTest` still asserts `DISABLED` after V1–V12 migrate. |
| `/sdd.finish` | **None** | WIP remains open; STATUS/progress only record branch state. |

## Validation

| Check | Result |
| --- | --- |
| Diff inventory vs `06a85e2` | **PASS.** 11 files; product surface matches 003C ownership only. |
| V12 LF-normalized SHA-256 | **PASS.** Pin `1352667604EFF8279C0759AA02C9A6119C7B7D446A18CE0DC6FC86AF1A60B0A5` asserted in `Posc003cCursorEtagTest` and `Posc002fAcceptanceMatrixTest`. |
| Focused Maven (PG16 Testcontainers) | **PASS (recorded, not re-run).** Parent/slice doc: `Posc003cCursorEtagTest` 3/3; 003A/003B/002F/saga/service/effective-offer exit 0. Local only; **not CI green.** |

## Implementation notes (non-blocking)

- **`visibility_digest` stub:** digest is `SHA-256(clientInstanceId + "catalog:read")`, not yet a full POSC-002 credential/scope-version tuple from the proposal. Acceptable for current single `CATALOG_READ` gate; expand when scopes diverge.  
- **Currency fallback:** missing `installation_settings.currency` now defaults `"ARS"` instead of `INSTALLATION_CURRENCY_MISSING`. V1 CHECK allows only ARS; restore fail-closed if multi-currency becomes a gate.  
- **Catalog SKU 1..64 filter:** SQL `char_length(v.sku) BETWEEN 1 AND 64` excludes long SKUs from pagination per proposal §24 catalog read model — not the 003D stock handler.  
- **Cursor cross-check tests:** no explicit PG16 test for wrong `pageSize` / `catalogVersion` / visibility on replay or cross-companion token; decode logic covers it. Add in SDD lane or follow-up if desired.  
- **`generation > 3` silent skip:** if three expired generations exist and content is live-new, response still returns 200 without a fourth INSERT — edge case only; live ETag/body remain correct.

## Findings

### P0 — none open

No scope leak into 003D–E, fiscal, live connector, or module activation. Core 003C contracts — opaque C1 cursor, LEGACY 410, strict pageSize, snapshot reuse, `e1_` ETag, auth-gated 304, stock-driven ETag without revision bump — are present in code and focused tests.

### Residual (honest, out of 003C verdict)

Stock handler split, H2/idempotency taxonomy, price-override audit consumption of `blackstore_price_quotes`, full concurrent GET deadlock matrix, and batch cleanup worker stay on 003D–E / 004A gates. `BLACKSTORE_INTEGRATION` remains DISABLED. Dual lane needs paired SDD review + both APPROVED before merge.

## Gaps

None blocking for POSC-003C scope merge readiness.
