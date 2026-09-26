VERDICT: APPROVED

# Grok 4.7 — PR #28 scope

**Lane:** SCOPE
**PR:** https://github.com/AgustinFalcon/storecore/pull/28
**Title:** Integrate the storefront mock branches
**GitHub base:** `master` (`baseRefName=master`)
**Branch:** `integration/storefront-mock`
**Published head when the review started:** `d8163a69f05edcdaf1ce710c8c538269083f9c64`
**Fetched head judged:** `d3f86fd3d6f9ab05d51aad9b360eba11008fbb10`
**State when reviewed:** `OPEN`
**Reviewed diff:** `git diff origin/master...HEAD` (`6831a13...d3f86fd`). 44 files, +2122 / −58.
**No merge.** This file does not approve GitHub, does not call CI green, and does not authorize merging this demo stack into `master` or `/sdd.finish`.

`d3f86fd` is `d8163a69` plus later home-blocks review notes only (`00908d5`, then `bc915f1` / `d3f86fd` rewriting `sdd/reviews/20260926-grok-pr25-scope.md`). `git diff d8163a69..d3f86fd -- frontend` is empty. The frontend product tree is the same.

## What was read

1. `gh pr view 28` (title, body, base `master`, state `OPEN`). The body is a demo stack. It says not to merge to `master`. It lists #22, #24, #25, #26, #27, and #29, and leaves #23 out.
2. Full `git diff --stat origin/master...HEAD`, then the merge-sensitive files: `catalog-query.entity.ts`, `catalog-page.component.ts`, `catalog-page.view.html`, `catalog.store.ts`, `offer-window.ts`, `product-tile.component.ts`, `storefront-home.view.html`, `product-page.view.html`, `product-page.view.ts`, `http-mappers.ts`, `user.store.ts`, `user-content.view.html`, `user-http.repository.ts`, `catalog-http.repository.ts`, `app.routes.ts`, `session-favorites.ts`, `favorites-browser.store.ts`.
3. Ancestry of the four stacked tips against `d3f86fd`: `feature/storecore-catalog-query-url` (`886c2e4`), `feature/storecore-promo-hours` (`9ae9aa6`), `feature/storecore-home-blocks` (`bc915f1`), `feature/storecore-favorites-ui` (`fd8680d`). Each `git merge-base --is-ancestor` exits 0.
4. `git diff origin/master...HEAD -- backend` and `*.kt` is empty. No `EffectivePrice` commit on this compare.

## SDD why

This PR is a storefront mock you can walk in one checkout. It is not a master merge and not a feature close-out. Catalog links stay on `q`, `brand`, `category`, and `offers=1`. A closed window keeps the catalog row and the product page, keeps the API effective price, and clears only the badge. A missing window still paints Oferta on Sólo ofertas and on the home rail. `/user/content` lists banner blocks from public `GET /content/home`, re-reads that GET after publish, and still PUTs only title and body. Favorites stay in `sessionStorage` and the list route stays behind `customerGuard`. Promo datetime checks and the read-only banner list both have to remain after the `user.store.ts` and `http-mappers.ts` merges. Kotlin effective price (PR 23) stays out.

## Stack

| Order | Branch | PR | On `00908d5` |
| --- | --- | --- | --- |
| 1 | `feature/storecore-catalog-query-url` | #22 | ancestor |
| 2 | `feature/storecore-promo-hours` | #26 | ancestor |
| 3 | `feature/storecore-home-blocks` (`bc915f1`) | #25 | ancestor |
| 4 | `feature/storecore-favorites-ui` | #24 | ancestor |

PR 23 is absent: the compare adds no Kotlin and no backend file. Badge behavior from the later offer-window commits on this branch (`showsOfferBadge`, `catalogOffersBadge`) is present in `offer-window.ts` and is what the catalog grid, product page, and home rail call.

`user.store.ts` versus `origin/feature/storecore-home-blocks` adds only `promoWindowError` / `promoForApi`. The public-home re-read in `loadHome` and `persistHome` is unchanged. `http-mappers.ts` versus that tip adds only `offerWindow` on summary and detail. Versus `origin/feature/storecore-promo-hours`, the same mapper adds `mapHomeDraft` (omit `blocks` when the payload has no array) and `homeDraftSavePayload` (title and body only). `catalog.store.ts` matches the promo-hours tip.

## Merge behavior

- **Query string.** `catalogQueryParams` writes `q`, `brand`, `category`, and `offers=1`. `catalogQueryFromParams` treats only `offers=1` as offers-only. `CatalogPageComponent` applies the route and writes it back on search. The catalog HTTP call still sends API `offers=true` when that flag is set. That split is the #22 contract.
- **Closed window.** `CatalogStore.search` and `loadProduct` map with `withoutClosedOfferBadge`. That helper keeps the product object and its price and sets `offerRef` to null when the window is closed. The grid still renders the row. `catalogOffersBadge` is false, so Sólo ofertas does not force Oferta. The product page still prints `product.price.effective` and `showOffer` is false. The home rail uses `isApiOfferVisible` and omits a closed window. That omission is the rail contract; the grid and the detail page are where the product and the effective price stay.
- **Missing window.** `isApiOfferVisible` stays true when either bound is absent. Sólo ofertas paints Oferta through `catalogOffersBadge`. The home rail keeps the card and `storefront-home.view.html` passes `[offer]="true"`, so `showsOfferBadge` paints Oferta. `mapProductSummary` still stores `price.effective` and does not invent a window.
- **`/user/content`.** `loadHome` joins the operator draft with `GetHomeUseCase`, which is public `GET /content/home`. `persistHome` saves title and body, then calls that public GET again and replaces `homeBlocks`. A failed public read sets `homeBlocks` to null, so the pre-save list is not kept and the empty-banner sentence stays hidden. The sentence renders only when `homeBlocks` is a present array of length 0 and the screen is not loading and has no error.
- **Favorites.** `FavoritesBrowserStore` reads and writes `sessionStorage` under `storecore.ui.favorites` (sku and name only). `/customer/favorites` has `canActivate: [customerGuard]`. The page copy says the list is this browser, not the installation.
- **Both operator behaviors.** `persistPromo` still rejects a window whose end is not after its start and sends `toInstallationInstant`. `persistHome` still re-reads the public home. `http-mappers.ts` still maps offer bounds and still refuses to PUT banner blocks.

## Validation

`npm test` in `C:\Users\agustin\Desktop\StoreCore-storefront-mock\frontend` (`node_modules` present), while the product tree was `d8163a69` and identical to `00908d5`: 27 files passed, 85 tests passed.

GitHub Verify on `d3f86fd` is run `36219131488`. Conclusion `failure`. Jobs `backend` and `frontend` completed in about two seconds with `steps: []`. That empty-step run is not CI green.

## Gaps

None that block this demo stack. Do not merge PR 28 to `master` from this note. Fiscal, payment, and Kotlin effective price stay out.
