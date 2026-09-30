VERDICT: APPROVED

# Grok 4.7 — POSC-003D scope

**Lane:** SCOPE
**Slice:** POSC-003D — stock read
**Branch:** `feature/posc003d-stock-read` @ `f8bf0d5`
**Base:** `origin/integration/storecore-int` @ `21780e4`
**Reviewed diff:** `git diff origin/integration/storecore-int...HEAD` — 1 commit, 10 files, +208 / −29
**No merge.** This file does not approve GitHub, does not call CI green, does not authorize `/sdd.finish`, and does not start Maven.

## What was read

1. `sdd/wip/20260927-pos-integration-convergence/3-tasks/posc003-implementation-slices.md` — slice 003D ownership and acceptance.
2. `sdd/wip/20260927-pos-integration-convergence/2-technical/posc003-catalog-reserve-proposal.md` — stock paragraphs (`GET /stock/variants/{variantId}`, sellable formula, SKU 1..64 vs 65..128, inactive visibility, reserve vs stale catalog qty).
3. Full `git diff origin/integration/storecore-int...HEAD`.
4. Implementation: `JdbcBlackStoreCatalogQuery.readStock`, `BlackStoreIntegrationService.stock`, existing `BlackStoreIntegrationController` `@GetMapping("/stock/variants/{variantId}")`, `JdbcBlackStoreSagaEngine.reserve` balance path, new `Posc003dStockReadTest`.

```text
f8bf0d5 Reject overlong SKUs on POS stock read and keep sellable honest.
```

## SDD why

POSC-003C merged cursor/ETag/V12 on `21780e4`. POSC-003D completes the stock-read slice only: one `GET /stock/variants/{variantId}` handler, honest physical sellable, SKU length gate aligned with catalog pagination, and proof that reserve reads live balances. POSC-003E (H2 hash, reservation handler hardening) stays NO-GO until 003D merges. Fiscal/ARCA, ML live connector, companion live, tag, deploy, publish, and `/sdd.finish` remain outside this slice.

## Scope checks

| Check | Result |
| --- | --- |
| One GET stock handler | PASS. Diff does not add routes or controllers. Pre-existing single mapping `@GetMapping("/stock/variants/{variantId}")` in `BlackStoreIntegrationController` delegates to `BlackStoreIntegrationService.stock` → `catalog.readStock`. No second stock endpoint introduced. |
| Absent variant → 404 | PASS. `readStock` uses `singleOrNull() ?: throw BlackStoreSagaException.notFound()` (`NOT_FOUND`, HTTP 404). `Posc003dStockReadTest.absentAndOverlongSkuAre404` asserts `NOT_FOUND` for variant `9_999_999`. |
| SKU 65..128 → 404 | PASS. SQL adds `char_length(v.sku) BETWEEN 1 AND 64`; overlong variants exist in DB but fail lookup → 404. Test seeds SKU length 64 (200), 65 and 128 (404). Catalog page excludes 65/128 from items while 64 remains visible. |
| SKU 64 + physical sellable | PASS. Test reads stock for 64-char SKU; `availableQuantity=5`, `catalogVersion` matches `currentCatalogVersion()`. Formula unchanged: `GREATEST(0, COALESCE(available_quantity,0) - COALESCE(safety_stock,0))`. |
| Inactive `active=false` visible in catalog; stock reports physical sellable | PASS. `readPage` already includes inactive variants with `active=false` on the item. `readStock` does not filter on `active`. Test `inactiveIsVisibleInCatalogAndStockReportsPhysicalSellable`: catalog item `active=false`, `availableQuantity=7`; stock read returns 7. |
| Reserve uses live balances, not catalog page qty | PASS. `JdbcBlackStoreSagaEngine.reserve` locks `inventory_balances FOR UPDATE` and compares `line.quantity` to live `sellable`. Test `reserveUsesLiveBalanceNotStaleCatalogQuantity`: catalog page shows 4, SQL updates balance to 1, reserve qty 3 → `INSUFFICIENT_STOCK`. No catalog snapshot quantity used in Tx-B. |
| No Flyway | PASS. `git diff ... -- db/migration` empty. No new `.sql` migration. |
| No H2 / 003E | PASS. No `request_hash_algorithm`, H2, or reservation-handler delta in diff. 003E remains deferred. |
| No fiscal / ML / live connector | PASS. Diff touches only BlackStore catalog query/service/port, test doubles, SDD tracking, and `Posc003dStockReadTest`. No fiscal/ARCA, `WebClient`, ML host, or outbox delivery code added. |
| `BLACKSTORE_INTEGRATION` stays DISABLED except test SQL | PASS. No `main` bootstrap or module flip. `Posc003dStockReadTest` `@BeforeAll` sets `state='ACTIVE'` only inside Testcontainers fixture SQL; production default remains DISABLED per WIP/STATUS. |

## Validations

| Check | Result |
| --- | --- |
| Diff name-only and commit list | PASS, 2026-09-30. Ten paths: 3 Kotlin main, 3 Kotlin test (1 new), 4 SDD docs. Single commit `f8bf0d5`. Base `21780e4`, head `f8bf0d5`. |
| Maven (`Posc003dStockReadTest`) | **Not run.** Review instruction: do not start Maven. Evidence is static read of test source and implementation. |
| GitHub Verify | Not checked. Scope lane only; hosted Verify is not interpreted as CI green. |

## Implementation notes (non-blocking)

- `readStock` signature gains `clientInstanceId: UUID` so `lazyDeleteExpired(clientInstanceId)` runs in `finally`, matching 003C catalog read hygiene. In scope for the existing stock handler path.
- Tests exercise `JdbcBlackStoreCatalogQuery` and `JdbcBlackStoreSagaEngine` directly, not HTTP. `NOT_FOUND` already maps to 404 via `BlackStoreSagaException`; no new exception taxonomy in this diff.
- Reserve SKU-length rejection (400 `VALIDATION` for 65..128) is proposal/003E territory; not required for 003D acceptance table.

## Gaps

No blocking scope gaps.

Non-blocking: no HTTP-level stock 404 contract test added in this diff (pre-existing fail-closed/contract tests cover the route shell). SDD docs updated to mark 003C merged and 003D local pending prv20 dual review.

## Residual NO-GO

POSC-003E, commit/release/reconcile (004), fiscal/ARCA, ML live connector, companion live, tag, deploy, publish, and `/sdd.finish` stay outside this slice. Merge requires the second Grok 4.7 lane (`prv20-sdd`) also `APPROVED`.
