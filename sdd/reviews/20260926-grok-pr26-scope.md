VERDICT: CHANGES_REQUIRED

# Grok 4.7 — PR #26 scope

**Lane:** SCOPE
**PR:** https://github.com/AgustinFalcon/storecore/pull/26
**Title:** Promos MANUAL con día y hora
**GitHub base:** `master` (`baseRefName=master`)
**Branch:** `feature/storecore-promo-hours`
**PR head confirmed before this note:** `3fcafa008b5b26ab96e9ddbb49936c8ccd0ea118` (`Record the scope re-review after the closed-window badge fix.`). `gh pr view 26` returned that `headRefOid`, state `OPEN`. That commit only rewrites this file.
**Parent of this note:** `1d7ef1e87baf8ff3fc927746a76baf6ca58f2fea` rewrites only `sdd/reviews/20260926-grok-pr26-sdd.md`. It does not change product code.
**Product tree judged:** `c512ef2ae883214d0665901503887f4c3ea9e782` (`Show the offer badge on the home rail when the API sends no window.`). `git diff origin/master...c512ef2`.
**Prior scope note:** `32a8f57` recorded `VERDICT: CHANGES_REQUIRED` against product commit `4d8f573`. The home rail had lost `Oferta` when the API sent no window, and catalog/detail still showed a badge when a window was closed. `4f9fd8a` and `c512ef2` are the follow-up. This file replaces the note on the branch.
**No merge.** This file does not approve GitHub, does not call CI green, and does not authorize `/sdd.finish`.

## What was read

1. `gh pr view 26` (title, body, base, commits, head). First confirmation in this re-review was `headRefOid=c512ef2`, state `OPEN`. A later read, after `3fcafa0`, was `headRefOid=3fcafa0`, still `OPEN`.
2. Full `git diff origin/master...c512ef2`, plus `git show 4f9fd8a` and `git show c512ef2`.
3. SDD why: `sdd/STATUS.md` (UX-ANG on existing routes; fiscal/ARCA, tag, deploy, publish, and `/sdd.finish` stay refused while MP-LIVE-05 is open); `sdd/PATTERNS.md` (base, desired, observed, and effective stay distinct; MANUAL writer and ML automation stay exclusive); screen inventory P-02 (`/catalog`, sólo ofertas, effective price).
4. Surfaces read in the tree, including ones the previous scope note called out: `product-tile.component.ts`, `catalog-page.view.html`, `product-page.view.html`, `storefront-home.view.html`, `mapProductSummary`, `mapProductDetail`, `CatalogStore`, and `JdbcCatalogService.search` / `product` (read only; not in the diff).

## SDD why

`/user/promos` stays the MANUAL writer for this installation’s calendar, with day and hour, and with no Mercado Libre automation. The storefront keeps the price the API already called effective. A window the catalog sends may hide the offer badge and drop the card from the home offers rail, and only then. A missing window must leave the API offer as sent. The PR test plan says a catalog payload without `validFrom` / `validUntil` keeps the badge and the effective price as they are today. STATUS still refuses fiscal/ARCA, live credentials, tag, deploy, publish, and `/sdd.finish`.

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

`4d8f573` removed `[offer]="true"` from `storefront-home.view.html`. `c512ef2` puts that input back. The net diff against `origin/master` does not touch that template: every card that remains on the rail still receives `[offer]="true"`.

`4f9fd8a` changes the catalog tile from `[offer]="state.query.offersOnly"` to `<sc-product-tile [product]="product" />`.

Also in the branch history, not product code: `sdd/reviews/20260926-grok-pr26-sdd.md` (`751c1f1`) and earlier text of this scope file.

No `app.routes.ts`, `package.json`, Kotlin, SQL, OpenAPI, or `.github` path. No `setInterval` or `setTimeout` added. The existing home carousel timer is not in this diff.

## Scope checks

| Check | Result |
| --- | --- |
| `/user/promos` uses `datetime-local` | PASS. Desde and Hasta are `type="datetime-local"`. The table prints installation local day and hour through `clock()`. `promoForApi` sends those values as ISO instants. `writer` stays `MANUAL`. |
| Until must be after from | PASS. `isValidOfferWindow` requires a parsed end strictly after the start. `persistPromo` sets `Hasta tiene que ser posterior a desde.` and the effect filter skips `save`, so there is no POST. Equal and inverted drafts are covered. Empty fields still use the existing required-field message. API error and retry stay on the existing `tapResponse` / `loadPromos` path. |
| Storefront keeps the API effective price | PASS. `mapProductSummary` still sells `price.effective`, or a numeric `price`. Struck `originalPrice` stays only when the API base/original is greater than that effective value. The tile prints `product.price`. Product detail still prints `product.price.effective`. `withoutClosedOfferBadge` copies the product and changes only `offerRef`. |
| Home offers rail drops a closed window and keeps the badge when the window is missing | PASS. `loadStorefront` keeps an offer unless both bounds parse and `now` is outside `[validFrom, validUntil)`. A missing, blank, or one-sided window stays on the rail. The template passes `[offer]="true"`, so `Oferta` still paints when `JdbcCatalogService.search` omits `offerRef`. An inverted window is not an open interval, so that card is dropped. |
| Product detail clears only a closed-window badge | PASS. `loadProduct` maps with `withoutClosedOfferBadge`. A closed window with `offerRef` set becomes `offerRef: null` and the page falls through to `sin oferta`. The product and `price.effective` stay. A missing window returns the same object, so an API `offerRef` stays. `JdbcCatalogService.product` still hardcodes `offerRef` null and sends no window; that file is not in this PR. |
| Catalog grid hides the badge only for a closed window | FAIL. See Gaps. |
| Missing window leaves the catalog offer badge as it is on `master` | FAIL. See Gaps. |
| No browser cron | PASS. The rail and the catalog read `new Date()` once when that response arrives. Nothing reschedules price or badge changes. |
| No invented discount, hardcoded SKU/price, or Kotlin | PASS in product code. SKU and price literals appear only in unit fixtures. The diff has no `.kt` file. |

## Validations

| Check | Result |
| --- | --- |
| Diff name-only and commit list | PASS, 2026-09-26. Product commits are `4d8f573`, `4f9fd8a`, and `c512ef2`. Merge-base with `origin/master` is `6831a13`. Frontend product net diff: 12 files, +345 / −22. |
| `npm test` in `frontend/` | PASS, 2026-09-26, against the product tree at `c512ef2` (this run finished before `3fcafa0`). `npm test` → `ng test --watch=false`: 22 files, 62 tests, exit 0. The suite covers the mapper window, `isApiOfferVisible`, `withoutClosedOfferBadge` (closed window, missing window, open window), and the promo POST guard. It does not construct `CatalogStore` or render a tile, so it does not catch the catalog checkbox. |
| GitHub Verify run [36216533374](https://github.com/AgustinFalcon/storecore/actions/runs/36216533374) on `3fcafa0` | **Not CI green.** `frontend` (`108333487397`) and `backend` (`108333487511`) both completed `failure` in about 2 s (`2026-09-26T04:00:37Z`–`04:00:39Z`), `steps: []`. The frontend check annotation says the job was not started because recent account payments failed or the spending limit needs to be increased. No test suite ran on GitHub. The product-head run [36216012262](https://github.com/AgustinFalcon/storecore/actions/runs/36216012262) on `c512ef2` failed the same way, also with `steps: []`. |

## Standards

StoreCore presentation stays container → view → ComponentStore → use case → HTTP repository (`sdd/PATTERNS.md`). The promo form stays a view; `UserStore` owns the window check and the instant conversion; `CatalogStore` owns the rail filter and the badge clear; `offer-window.ts` stays free of Angular. Commercial safety holds for the price fields: effective is still the selling price.

No backend file is in the diff. No new route, SDK, fiscal path, BlackStore client, secret, tag, deploy, or `/sdd.finish`.

## Gaps

Blocking. The catalog grid hides `Oferta` when the payload has no window.

`ProductTileComponent` paints the badge when `offer || product.offerRef`. On `master`, the catalog tile passed `[offer]="state.query.offersOnly"`. `JdbcCatalogService.search` still returns `sku`, `name`, and `price` only, so the mapped summary has no `offerRef` and no window. “Sólo ofertas” was the badge. `4f9fd8a` removes that input. `withoutClosedOfferBadge` returns the same object when `offerRef` is null, including when both bounds are absent. The checkbox no longer reaches the tile. A catalog search with no window now shows the effective price and no `Oferta`, including the offers-only filter. That is the home-rail failure from `4d8f573`, on P-02.

The home rail is not this gap. `c512ef2` can pass `[offer]="true"` because `loadStorefront` already drops a closed window. The catalog grid keeps the row, so it cannot pass `[offer]="true"` for every card, and it cannot pass `[offer]="state.query.offersOnly"` for a closed window either. The offers-only badge has to stay when `isApiOfferVisible` is true (missing, blank, one-sided, or open) and stay off when that helper is false.

Product detail does not have this checkbox path. A closed window there clears `offerRef` and leaves the effective price. That half of `4f9fd8a` holds.

## Residual NO-GO

MP-LIVE-05, live credentials, fiscal/ARCA, BlackStore companion live, tag, deploy, publish, and `/sdd.finish` stay outside this PR. This verdict is scope only. No merge. No GitHub approve. CI is not green.
