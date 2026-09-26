VERDICT: APPROVED

# Grok 4.7 — PR #26 scope

**Lane:** SCOPE
**PR:** https://github.com/AgustinFalcon/storecore/pull/26
**Title:** Promos MANUAL con día y hora
**GitHub base:** `master` (`baseRefName=master`)
**Branch:** `feature/storecore-promo-hours`
**Product head requested:** `aaa1c19d3460d82e3b8df07974b9ae8deba6e203`
**First confirmation:** `gh pr view 26` and `git rev-parse HEAD` / `origin/feature/storecore-promo-hours` all returned `aaa1c19d3460d82e3b8df07974b9ae8deba6e203`, state `OPEN`.
**Tip before this note:** the remote moved to `d197cff5ca48c91a6b0bf1b288b294ef093bfee2` with review markdown only (`7b5ca71` scope, `d197cff` SDD). `git diff aaa1c19 -- frontend` is empty. There is no newer product tree. This verdict judges `aaa1c19`.
**Prior scope note:** `8ff20e0` recorded `VERDICT: CHANGES_REQUIRED` because the catalog grid dropped `Oferta` when the API sent no window.
**No merge.** This file does not approve GitHub, does not call CI green, and does not authorize `/sdd.finish`.

## What was read

1. `gh pr view 26` (title, body, base, head, state, checks). Later `gh pr checks 26` on the review-only tip.
2. Full `git diff origin/master...HEAD` while HEAD was `aaa1c19`, plus `git show aaa1c19`.
3. SDD why: `sdd/STATUS.md` (UX-ANG on existing routes; fiscal/ARCA, tag, deploy, publish, and `/sdd.finish` stay refused while MP-LIVE-05 is open); `sdd/PATTERNS.md` (base, desired, observed, and effective stay distinct; MANUAL writer and ML automation stay exclusive). The PR body: MANUAL day and hour, effective price unchanged, missing window stays as the API sent it, closed window hides the badge and leaves the home rail.
4. `offer-window.ts`, `catalog-page.view.html`, `catalog-page.view.ts`, `catalog.store.ts`, `product-tile.component.ts`, `storefront-home.view.html`, `product-page.view.html`, `http-mappers.ts`, `user-promos.view.html`, `user-promos.view.ts`, `user.store.ts`. `JdbcCatalogService.search` / `product` were read only; that Kotlin file is not in the diff.

## SDD why

`/user/promos` stays the MANUAL writer for this installation’s calendar, with day and hour, and with no Mercado Libre automation. The storefront keeps the price the API already called effective. A window the catalog sends may hide the offer badge and drop the card from the home offers rail, and only then. A missing window must leave the API offer as sent. The catalog “Sólo ofertas” badge is on only when that filter is set and `isApiOfferVisible` is true. STATUS still refuses fiscal/ARCA, live credentials, tag, deploy, publish, and `/sdd.finish`.

## Diff judged

Net `origin/master...aaa1c19` frontend product paths (13 files, +377 / −23). Review markdown is not product code.

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
frontend/src/app/features/storefront/catalog-page.view.ts
frontend/src/app/features/storefront/catalog.store.ts
```

`aaa1c19` is the only product change after `c512ef2`. It adds `catalogOffersBadge` and wires the catalog tile through `offersBadge`. Merge-base with `origin/master` is `6831a135e9cb74627b995ca6f4472f757416b3f3`.

The net diff against `origin/master` does not touch `storefront-home.view.html`. Every card that remains on the rail still receives `[offer]="true"`.

No `app.routes.ts`, `package.json`, Kotlin, SQL, OpenAPI, or `.github` path. No `setInterval` or `setTimeout` added. The existing home carousel timer is not in this diff.

## Scope checks

| Check | Result |
| --- | --- |
| `/user/promos` uses `datetime-local` | PASS. Desde and Hasta are `type="datetime-local"`. The table prints installation local day and hour through `clock()`. `promoForApi` sends those values as ISO instants. `writer` stays `MANUAL`. |
| Until must be after from | PASS. `isValidOfferWindow` requires a parsed end strictly after the start. `persistPromo` sets `Hasta tiene que ser posterior a desde.` and the effect filter skips `save`, so there is no POST. Equal and inverted drafts are covered. Empty fields still use the existing required-field message. API error and retry stay on the existing `tapResponse` / `loadPromos` path. |
| Storefront keeps the API effective price | PASS. `mapProductSummary` still sells `price.effective`, or a numeric `price`. Struck `originalPrice` stays only when the API base/original is greater than that effective value. The tile prints `product.price`. Product detail still prints `product.price.effective`. `withoutClosedOfferBadge` copies the product and changes only `offerRef`. |
| Home offers rail drops a closed window and keeps the badge when the window is missing | PASS. `loadStorefront` keeps an offer unless both bounds parse and `now` is outside `[validFrom, validUntil)`. A missing, blank, or one-sided window stays on the rail. The template passes `[offer]="true"`. An inverted window is not an open interval, so that card is dropped. |
| Product detail clears only a closed-window badge | PASS. `loadProduct` maps with `withoutClosedOfferBadge`. A closed window with `offerRef` set becomes `offerRef: null` and the page falls through to `sin oferta`. The product and `price.effective` stay. A missing window returns the same object. `JdbcCatalogService.product` still hardcodes `offerRef` null and sends no window; that file is not in this PR. |
| Catalog grid: `[offer]` is true only when Sólo ofertas is on and `isApiOfferVisible` is true | PASS. See the closed gap below. |
| Missing window keeps the badge; a closed window does not; the row and the API price stay | PASS. |
| No browser cron | PASS. The rail reads `new Date()` once when the home response arrives. The catalog badge reads `new Date()` in `offersBadge` when that binding runs. Nothing reschedules price or badge changes. |
| No invented discount, hardcoded SKU/price, or Kotlin | PASS in product code. SKU and price literals appear only in unit fixtures. The diff has no `.kt` file. |

## Closed gap

`ProductTileComponent` paints `Oferta` when `offer || product.offerRef`. On `master`, the catalog tile passed `[offer]="state.query.offersOnly"`. `8ff20e0` failed because that input had been removed, and `JdbcCatalogService.search` still returns `sku`, `name`, and a numeric `price` only, so a payload with no window and no `offerRef` lost the badge.

`aaa1c19` renders `<sc-product-tile [product]="product" [offer]="offersBadge(product)" />`. `offersBadge` returns `catalogOffersBadge(this.state.query.offersOnly, product.validFrom, product.validUntil, new Date())`. `catalogOffersBadge` is `offersOnly && isApiOfferVisible(...)`.

`isApiOfferVisible` stays true when either bound is missing, blank, or unparsable, including a one-sided window. It stays false when both bounds parse and `now` is outside `[validFrom, validUntil)`, and when `until <= from`. Search still maps with `withoutClosedOfferBadge`, so a closed window keeps the row and the price reference and clears only `offerRef`. The tile cannot revive `Oferta` from a leftover `offerRef`. With “Sólo ofertas” on and no window, `[offer]` is true. With the filter off, `[offer]` is false and an API `offerRef` still paints the badge until a closed window clears it.

The home rail is not this gap. `c512ef2` can pass `[offer]="true"` because `loadStorefront` already drops a closed window. `aaa1c19` does not change that template.

## Validations

| Check | Result |
| --- | --- |
| Diff name-only and commit list | PASS, 2026-09-26. Product commits are `4d8f573`, `4f9fd8a`, `c512ef2`, and `aaa1c19`. Frontend product net diff: 13 files, +377 / −23. |
| `npm test` in `frontend/` | PASS, 2026-09-26, worktree `StoreCore-promo-badge` at product tree `aaa1c19`. The first `npm test` exited 1 because `node_modules` was absent (`Could not find the '@angular/build:unit-test' builder's node package`). `npm ci` then added 581 packages. The following `npm test` (`ng test --watch=false`, Vitest 4.1.11) exited 0: 22 files, 64 tests, duration 10.53s. The two new cases cover `catalogOffersBadge` for a missing window and for a closed window with Sólo ofertas on. The suite does not render `CatalogPageView`; the template calls the tested function. |
| GitHub Verify run [36217022818](https://github.com/AgustinFalcon/storecore/actions/runs/36217022818) on `aaa1c19` | **Not CI green.** `frontend` (`108334897902`) and `backend` (`108334898083`) both completed `failure` in about 2 s (`2026-09-26T04:10:13Z`–`04:10:15Z`), `steps: []`. Both annotations say the job was not started because recent account payments failed or the spending limit needs to be increased. No test suite ran on GitHub. |
| GitHub Verify run [36218231804](https://github.com/AgustinFalcon/storecore/actions/runs/36218231804) on review tip `d197cff` | **Not CI green.** `backend` (`108338391048`) and `frontend` (`108338391076`) both completed `failure` in about 2 s (`2026-09-26T04:34:26Z`–`04:34:28Z`), `steps: []`. The frontend annotation is the same spending-limit message. A job that fails in about 2 s with `steps: []` is not a green check. |

## Standards

StoreCore presentation stays container → view → ComponentStore → use case → HTTP repository (`sdd/PATTERNS.md`). The promo form stays a view; `UserStore` owns the window check and the instant conversion; `CatalogStore` owns the rail filter and the badge clear; `offer-window.ts` stays free of Angular. The catalog view only asks `catalogOffersBadge` whether the checkbox badge is on. Commercial safety holds for the price fields: effective is still the selling price.

No backend file is in the diff. No new route, SDK, fiscal path, BlackStore client, secret, tag, deploy, or `/sdd.finish`.

## Gaps

None blocking. The catalog checkbox gap from `8ff20e0` is closed by `aaa1c19`.

## Residual NO-GO

MP-LIVE-05, live credentials, fiscal/ARCA, BlackStore companion live, tag, deploy, publish, and `/sdd.finish` stay outside this PR. This verdict is scope only. No merge. No GitHub approve. CI is not green.
