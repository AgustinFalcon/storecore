VERDICT: APPROVED

# Grok 4.7 — PR #26 scope

**Lane:** SCOPE
**PR:** https://github.com/AgustinFalcon/storecore/pull/26
**Title:** Promos MANUAL con día y hora
**GitHub base:** `master` (`baseRefName=master`)
**Branch:** `feature/storecore-promo-hours`
**Head at the start of this re-review:** `4f9fd8afde42a045ce435acdfd74309eb2e4a7e9` (`Clear the offer badge when a promo window is closed.`). `gh pr view 26` returned that `headRefOid` while the PR was `OPEN`.
**Product tree judged:** `c512ef2ae883214d0665901503887f4c3ea9e782` (`Show the offer badge on the home rail when the API sends no window.`). That commit is the parent of this file. It landed on the PR after `4f9fd8a` and before this note was written. `git diff origin/master...c512ef2` is the reviewed diff.
**Prior scope note:** `32a8f57` recorded `VERDICT: CHANGES_REQUIRED` against product commit `4d8f573`. This file replaces that note.
**No merge.** This file does not approve GitHub, does not call CI green, and does not authorize `/sdd.finish`.

## What was read

1. `gh pr view 26` (title, body, base, commits, Verify rollup). The first read in this re-review was `headRefOid=4f9fd8a`. A later read, after `c512ef2` was pushed, was `headRefOid=c512ef2`, state `OPEN`.
2. Full `git diff origin/master...HEAD` at `c512ef2`, plus `git show 4f9fd8a` and `git show c512ef2`.
3. SDD why: `sdd/STATUS.md` (UX-ANG on existing routes; fiscal/ARCA, tag, deploy, publish, and `/sdd.finish` stay refused while MP-LIVE-05 is open); `sdd/PATTERNS.md` (base, desired, observed, and effective stay distinct; MANUAL writer and ML automation stay exclusive).
4. Surfaces read in the tree, including ones the previous scope note called out: `product-tile.component.ts`, `catalog-page.view.html`, `product-page.view.html`, `storefront-home.view.html`, `mapProductSummary`, `mapProductDetail`, and `JdbcCatalogService.search` (read only; still not in the diff).

The worktree was clean at `c512ef2` before this file was overwritten.

## SDD why

`/user/promos` stays the MANUAL writer for this installation’s calendar, with day and hour, and with no Mercado Libre automation. The storefront keeps the price the API already called effective. A window the catalog sends may hide the offer badge and drop the card from the home offers rail, and only then. A missing window must leave the API offer as sent. STATUS still refuses fiscal/ARCA, live credentials, tag, deploy, publish, and `/sdd.finish`.

## Diff judged

Net `origin/master...c512ef2` product paths (12 frontend files, +345 / −22):

```text
frontend/src/app/data/mappers/http-mappers.spec.ts
frontend/src/app/data/mappers/http-mappers.ts
frontend/src/app/domain/catalog/offer-window.spec.ts
frontend/src/app/domain/catalog/offer-window.ts
frontend/src/app/domain/catalog/product-detail.entity.ts
frontend/src/app/domain/catalog/product-summary.entity.ts
frontend/src/app/features/admin/user-promos.view.html
frontend/src/app/features/admin/user-promos.view.ts
frontend/src/app/features/admin/user.store.spec.ts
frontend/src/app/features/admin/user.store.ts
frontend/src/app/features/storefront/catalog-page.view.html
frontend/src/app/features/storefront/catalog.store.ts
```

`4d8f573` also removed `[offer]="true"` from `storefront-home.view.html`. `c512ef2` puts that input back. The net diff against `origin/master` does not touch that template: every card that remains on the rail still receives `[offer]="true"`.

Also in the branch history, not product code: `sdd/reviews/20260926-grok-pr26-sdd.md` (`751c1f1`) and the previous text of this scope file (`32a8f57`).

No `app.routes.ts`, `package.json`, Kotlin, SQL, OpenAPI, or `.github` path. No `setInterval` or `setTimeout` added. The existing home carousel timer is not in this diff.

## Scope checks

| Check | Result |
| --- | --- |
| `/user/promos` uses `datetime-local` | PASS. Desde and Hasta are `type="datetime-local"`. The table prints installation local day and hour through `clock()`. `promoForApi` sends those values as ISO instants. `writer` stays `MANUAL`. |
| Until must be after from | PASS. `isValidOfferWindow` requires a parsed end strictly after the start. `persistPromo` sets `Hasta tiene que ser posterior a desde.` and the effect filter skips `save`, so there is no POST. Equal and inverted drafts are covered. Empty fields still use the existing required-field message. API error and retry stay on the existing `tapResponse` / `loadPromos` path. |
| Storefront keeps the API effective price | PASS. `mapProductSummary` still sells `price.effective`, or a numeric `price`. Struck `originalPrice` stays only when the API base/original is greater than that effective value. The tile prints `product.price`. Product detail still prints `product.price.effective`. `withoutClosedOfferBadge` copies the product and changes only `offerRef`. |
| Catalog search and product detail clear only a closed-window badge | PASS. `CatalogStore.search` maps with `withoutClosedOfferBadge`. `loadProduct` does the same. A closed window (`both bounds parsed` and `now` outside `[validFrom, validUntil)`) sets `offerRef` to null and keeps the product, `price`, and the detail `active` flag. The product stays in the catalog list. |
| Home offers rail drops a closed window | PASS. `loadStorefront` keeps an offer unless both bounds parse and `now` is outside `[validFrom, validUntil)`. A missing, blank, or one-sided window stays on the rail. An inverted window is not an open interval, so that card is dropped. |
| Offer badge hides only for that same closed window | PASS. The home template still passes `[offer]="true"`, so a card that the filter kept shows `Oferta` even when the search row has no `offerRef`. The catalog tile is `<sc-product-tile [product]="product" />` and no longer passes `[offer]="state.query.offersOnly"`. `ProductTileComponent` paints `Oferta` only for `offer` or `product.offerRef`. Product detail paints `oferta {{ product.offerRef }}` only when `offerRef` is set; a cleared ref falls through to the existing `sin oferta` line. |
| Missing window leaves `offerRef` as the API sent it | PASS. `withoutClosedOfferBadge` returns the same object when `isApiOfferVisible` is true, including a missing, blank, or one-sided window. The mapper adds `validFrom` / `validUntil` only for a non-blank string. It does not invent `offerRef`. |
| No browser cron | PASS. The rail and the catalog read `new Date()` once when that response arrives. Nothing reschedules price or badge changes. |
| No invented discount, hardcoded SKU/price, or Kotlin | PASS in product code. SKU and price literals appear only in unit fixtures. The diff has no `.kt` file. `JdbcCatalogService.search` is unchanged and still returns `sku`, `name`, and `price` only. |

## Validations

| Check | Result |
| --- | --- |
| Diff name-only and commit list | PASS, 2026-09-26. Product commits on the branch are `4d8f573`, `4f9fd8a`, and `c512ef2`. Merge-base with `origin/master` is `6831a13`. Frontend net diff: 12 files, +345 / −22. |
| `npm test` in `frontend/` | PASS, 2026-09-26, at `c512ef2`. `ng test --watch=false`: 22 files, 62 tests. The suite covers the mapper window, `isApiOfferVisible`, `withoutClosedOfferBadge` (closed window, missing window, open window), and the promo POST guard. It does not construct `CatalogStore` or render a tile. |
| GitHub Verify run [36216012262](https://github.com/AgustinFalcon/storecore/actions/runs/36216012262) on `c512ef2` | **Not CI green.** `frontend` and `backend` both completed `failure` in about 1–2 s (`2026-09-26T03:50:01Z`–`03:50:03Z`), `steps: []`. Check-run annotations on both: the job was not started because recent account payments failed or the spending limit needs to be increased. No test suite ran on GitHub. The earlier run [36214973326](https://github.com/AgustinFalcon/storecore/actions/runs/36214973326) on `4f9fd8a` failed the same way, also with `steps: []`. |

## Standards

StoreCore presentation stays container → view → ComponentStore → use case → HTTP repository (`sdd/PATTERNS.md`). The promo form stays a view; `UserStore` owns the window check and the instant conversion; `CatalogStore` owns the rail filter and the badge clear; `offer-window.ts` stays free of Angular. Commercial safety holds for the price fields: effective is still the selling price.

No backend file is in the diff. No new route, SDK, fiscal path, BlackStore client, secret, tag, deploy, or `/sdd.finish`.

## Gaps

None blocking.

`hasOfferWindow` is exported and unused. Callers use `isApiOfferVisible`, which already treats a missing bound as “do not hide.” The unit suite does not mount `CatalogStore`, so it does not execute the home `filter` versus the catalog `map`. Those two calls are in `catalog.store.ts` and match the split above.

`JdbcCatalogService.search` still omits `offerRef` and the window. That file is not in this PR. On that payload the home rail still shows `Oferta` because `[offer]="true"` remains, and the catalog chip follows `offerRef` (null) instead of the “Sólo ofertas” checkbox. A payload that does send `offerRef` and both bounds is what the new helpers gate.

## Residual NO-GO

MP-LIVE-05, live credentials, fiscal/ARCA, BlackStore companion live, tag, deploy, publish, and `/sdd.finish` stay outside this PR. This verdict is scope only. No merge. No GitHub approve. CI is not green.
