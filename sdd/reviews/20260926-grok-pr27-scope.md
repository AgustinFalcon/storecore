VERDICT: CHANGES_REQUIRED

# Grok 4.7 — PR #27 scope

**Lane:** SCOPE
**PR:** https://github.com/AgustinFalcon/storecore/pull/27
**Title:** Extender la ventana de oferta al catálogo y al detalle
**GitHub base:** `feature/storecore-promo-hours` (`baseRefName=feature/storecore-promo-hours`, `baseRefOid=4f9fd8a`)
**Branch:** `feature/storecore-offer-window-pages` @ `19f869c` (`Hide catalog and product offer badges outside the promo window.`)
**Reviewed diff:** `git diff origin/feature/storecore-promo-hours...origin/feature/storecore-offer-window-pages` after `git fetch origin`. Merge-base is `751c1f1`. The three-dot diff is that one commit: 7 frontend files, +204 / −3.
**No merge.** This file does not approve GitHub, does not call CI green, and does not authorize `/sdd.finish`.

## What was read

1. `gh pr view 27` (title, body, base `feature/storecore-promo-hours`, head `19f869c`, the single commit, the seven files, empty check rollup). `mergeable` is `CONFLICTING` and `mergeStateStatus` is `DIRTY`.
2. Full three-dot diff named above. Parent of `19f869c` is `751c1f1`, which is behind the base tip.
3. SDD why on that history: `sdd/STATUS.md` (UX-ANG on existing routes; fiscal/ARCA, tag, deploy, publish, and `/sdd.finish` stay refused; a Verify job that never starts is not CI green). `sdd/reviews/20260926-grok-pr26-scope.md` (home rail may drop a closed window; catalog grid and product detail were still showing the badge; a missing window must keep the API offer; effective price stays the API value). `offer-window.ts` at the base tip `4f9fd8a` (closed window clears only the badge on catalog and detail; home still omits the product; missing window keeps the offer).
4. Base tip `4f9fd8a` (`Clear the offer badge when a promo window is closed.`), which is on `origin/feature/storecore-promo-hours` and not in the PR commit. `git merge-tree --write-tree` between that tip and `19f869c` (no checkout, no merge).

## SDD why

The catalog grid and the product detail keep the product and the numeric effective price the API already sent. When that payload includes `validFrom` and `validUntil` and now is outside the window, only the Oferta badge goes away. A missing window keeps the API offer. The home rail already omits a closed window. This PR must not add a countdown, a hardcoded SKU or price, or Kotlin. STATUS still refuses fiscal/ARCA, live credentials, tag, deploy, publish, and `/sdd.finish`.

## Diff judged

```text
frontend/src/app/data/mappers/http-mappers.spec.ts
frontend/src/app/data/mappers/http-mappers.ts
frontend/src/app/domain/catalog/product-detail.entity.ts
frontend/src/app/features/storefront/catalog.store.spec.ts
frontend/src/app/features/storefront/catalog.store.ts
frontend/src/app/shared/product-tile.component.spec.ts
frontend/src/app/shared/product-tile.component.ts
```

Commit `19f869c` only. No `app.routes.ts`, `package.json`, Kotlin, SQL, OpenAPI, `.github`, or `sdd/` path. No `setInterval` or `setTimeout`.

## Scope checks

| Check | Result |
| --- | --- |
| Catalog grid hides Oferta outside a complete window and keeps the numeric price | PASS on `19f869c` alone. `showOffer` paints `Oferta` only when the card is marked and `isApiOfferVisible` is true. `search` maps hits through `offerForDisplay`, which sets `offerRef` to null and leaves `price` and `originalPrice`. The product stays in the grid. |
| Product detail hides the offer badge and keeps `price.effective` | PASS on `19f869c` alone. `mapProductDetail` copies the window. `loadProduct` stores `offerForDisplay`. The existing buy box prints `oferta {{ product.offerRef }}` only when `offerRef` is set, and it still prints `product.price.effective`. |
| Missing window keeps the API offer | PASS on `19f869c` alone. `isApiOfferVisible` stays true unless both bounds parse. The store spec keeps `offerRef` for a one-sided `validFrom` and for a detail with no window. The mapper spec keeps `offerRef` and `price.effective` when the detail payload omits the window. |
| No countdown | PASS. `new Date()` is read when search or product load completes, and again in the tile getter. Nothing reschedules a timer. |
| No hardcoded SKU or price in product code | PASS. `SKU-1`, `80`, and `100` appear only in unit fixtures. |
| No Kotlin | PASS. The seven paths are Angular. |
| Lands on the declared base `4f9fd8a` | FAIL. See Gaps. |

## Validations

| Check | Result |
| --- | --- |
| Diff name-only and commit list | PASS, 2026-09-26. One commit `19f869c`. Seven frontend files, +204 / −3, matching `gh pr view 27`. Merge-base with `origin/feature/storecore-promo-hours` is `751c1f1`. Base tip is `4f9fd8a`. |
| `npm test` | Not re-run. No worktree has `feature/storecore-offer-window-pages` checked out. `StoreCore-home-blocks` is detached at `19f869c` and has `frontend/node_modules`; that is the commit, not the branch. `StoreCore-offer-window-surfaces` is on `feature/storecore-offer-window-surfaces` and was not switched. This review judged the diff. |
| GitHub Verify on `19f869c` | **Not CI green.** `statusCheckRollup` is empty. `gh pr checks 27` reports no checks. `gh run list` for that commit is empty. No suite ran on GitHub. |
| Merge onto `origin/feature/storecore-promo-hours` | FAIL, 2026-09-26. GitHub `mergeable=CONFLICTING`. `git merge-tree --write-tree` reports content conflicts in `frontend/src/app/features/storefront/catalog.store.ts` and `frontend/src/app/data/mappers/http-mappers.spec.ts`. No checkout and no merge was made. |

## Standards

StoreCore presentation stays container → view → ComponentStore → use case → HTTP repository (`sdd/PATTERNS.md`). On `19f869c`, the product page container still passes `store.product$`, and the catalog grid still renders `state.products` through `sc-product-tile`. The store clears `offerRef` for display. `isApiOfferVisible` stays in `offer-window.ts`, which has no Angular import. Effective price is still the selling price: the grid prints `product.price`, and detail prints `product.price.effective`.

No backend file is in the three-dot diff. No new route, SDK, fiscal path, BlackStore client, secret, tag, deploy, or `/sdd.finish`.

## Gaps

Blocking. `19f869c` does not apply onto the base this PR names.

`origin/feature/storecore-promo-hours` is `4f9fd8a`. That commit already maps the detail window, adds `validFrom` / `validUntil` on `ProductDetail`, and clears the badge in `CatalogStore.search` and `loadProduct` with `withoutClosedOfferBadge`. It also stops passing `[offer]="state.query.offersOnly"` on the catalog grid. The PR was cut from `751c1f1` and repeats the store and detail-mapper edit with a local `offerForDisplay` plus a second copy of the detail-window mapper spec. Those two files conflict. Until that conflict is resolved, the catalog grid and the product detail do not have one landed badge path on `feature/storecore-promo-hours`.

The tile gate in this diff is still the piece the base tip does not have: `showOffer` hides `Oferta` when both bounds exist and now is outside the window, including when the `offer` input is true, and it leaves `product.price` as stored. A resolution needs that gate, one store helper (`withoutClosedOfferBadge` already on `4f9fd8a`), and one detail-window mapper spec. `offerForDisplay` should not remain beside that helper.

Non-blocking on `19f869c` itself. The unchanged detail template still shows `sin oferta` when `offerRef` is null, which is what a closed window becomes after `offerForDisplay`. The `oferta {{ product.offerRef }}` badge is not shown, and `price.effective` stays. The shared tile also consults the window on the home rail; `loadStorefront` still drops a closed window from that rail and is unchanged in this diff.

## Residual NO-GO

MP-LIVE-05, live credentials, fiscal/ARCA, BlackStore companion live, tag, deploy, publish, and `/sdd.finish` stay outside this PR. This verdict is scope only. No merge. No GitHub approve. CI is not green.
