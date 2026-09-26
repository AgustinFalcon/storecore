VERDICT: APPROVED

# Grok 4.7 — PR #26 scope (re-review)

**Lane:** SCOPE
**PR:** https://github.com/AgustinFalcon/storecore/pull/26
**Title:** Promos MANUAL con día y hora
**GitHub base:** `master` (`baseRefName=master`)
**Branch:** `feature/storecore-promo-hours`
**PR head confirmed before this note:** `d197cff5ca48c91a6b0bf1b288b294ef093bfee2` rewrites only `sdd/reviews/20260926-grok-pr26-sdd.md`. `7b5ca7151f7f196fa03191d267b74a8c2ab935af` rewrites only this scope file. `gh pr view 26` during the product read returned `headRefOid=aaa1c19d3460d82e3b8df07974b9ae8deba6e203`, state `OPEN`.
**Product tree judged:** `aaa1c19d3460d82e3b8df07974b9ae8deba6e203`. `git diff origin/master...aaa1c19`. Merge-base with `origin/master` is `6831a135e9cb74627b995ca6f4472f757416b3f3`.
**Prior scope note:** `8ff20e0` recorded `VERDICT: CHANGES_REQUIRED` against product commit `c512ef2`. The catalog grid hid `Oferta` when the payload had no window, because `[offer]` had been removed. `aaa1c19` is the follow-up. `7b5ca71` already replaced that note with an approval; this file is the re-review of the same product tree.
**No merge.** This file does not approve GitHub, does not call CI green, and does not authorize `/sdd.finish`.

## What was read

1. `gh pr view 26` (title, body, base, commits, head, checks). Head `aaa1c19d3460d82e3b8df07974b9ae8deba6e203`, state `OPEN`.
2. Full `git diff origin/master...aaa1c19`, plus `git show aaa1c19`. `7b5ca71` does not change product code.
3. SDD why: `sdd/STATUS.md` (UX-ANG on existing routes; fiscal/ARCA, tag, deploy, publish, and `/sdd.finish` stay refused while MP-LIVE-05 is open); `sdd/PATTERNS.md` (base, desired, observed, and effective stay distinct; MANUAL writer and ML automation stay exclusive); screen inventory P-02 (`/catalog`, sólo ofertas, effective price).
4. Surfaces read in the tree: `offer-window.ts`, `catalog-page.view.html`, `catalog-page.view.ts`, `catalog.store.ts`, `product-tile.component.ts`, `storefront-home.view.html`, `product-page.view.html`, `mapProductSummary`, `mapProductDetail`, `user-promos.view.html`, `user-promos.view.ts`, and `UserStore.persistPromo`.

## SDD why

`/user/promos` stays the MANUAL writer for this installation’s calendar, with day and hour, and with no Mercado Libre automation. The storefront keeps the price the API already called effective. A window the catalog sends may hide the offer badge and drop the card from the home offers rail, and only then. A missing window must leave the API offer as sent. The PR test plan says a catalog payload without `validFrom` / `validUntil` keeps the badge and the effective price as they are today. STATUS still refuses fiscal/ARCA, live credentials, tag, deploy, publish, and `/sdd.finish`.

## Diff judged

Net `origin/master...aaa1c19` (15 files, +549 / −23), of which the product paths are 13 frontend files:

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

Also on the branch, not product code: `sdd/reviews/20260926-grok-pr26-sdd.md` and the previous text of this scope file.

`aaa1c19` is the only product change after `c512ef2`. It adds `catalogOffersBadge` and wires the catalog tile to `[offer]="offersBadge(product)"`. `storefront-home.view.html` and `product-page.view.html` are not in the compare. The home rail still passes `[offer]="true"` to every card that remains.

No `app.routes.ts`, `package.json`, Kotlin, SQL, OpenAPI, or `.github` path. No `setInterval` or `setTimeout` added. The existing home carousel timer is not in this diff.

## Scope checks

| Check | Result |
| --- | --- |
| `/user/promos` uses `datetime-local` | PASS. Desde and Hasta are `type="datetime-local"`. The table prints installation local day and hour through `clock()`. `promoForApi` sends those values as ISO instants. `writer` stays `MANUAL`. |
| Until must be after from | PASS. `isValidOfferWindow` requires a parsed end strictly after the start. `persistPromo` sets `Hasta tiene que ser posterior a desde.` and the effect filter skips `save`, so there is no POST. Equal and inverted drafts are covered. Empty fields still use the existing required-field message. API error and retry stay on the existing `tapResponse` / `loadPromos` path. |
| Storefront keeps the API effective price | PASS. `mapProductSummary` still sells `price.effective`, or a numeric `price`. Struck `originalPrice` stays only when the API base/original is greater than that effective value. The tile prints `product.price`. Product detail still prints `product.price.effective`. `withoutClosedOfferBadge` copies the product and changes only `offerRef`. The spec asserts the price reference is unchanged. |
| Home offers rail drops a closed window and keeps the badge when the window is missing | PASS. `loadStorefront` keeps an offer unless both bounds parse and `now` is outside `[validFrom, validUntil)`. A missing, blank, or one-sided window stays on the rail. The template passes `[offer]="true"`, so `Oferta` still paints when the search row has no `offerRef`. An inverted window is not an open interval, so that card is dropped. |
| Product detail clears only a closed-window badge | PASS. `loadProduct` maps with `withoutClosedOfferBadge`. A closed window with `offerRef` set becomes `offerRef: null` and the page falls through to `sin oferta`. The product and `price.effective` stay. A missing window returns the same object, so an API `offerRef` stays. |
| Catalog grid hides the badge only for a closed window | PASS. See the closed gap below. |
| Missing window leaves the catalog offer badge as it is on `master` | PASS. See the closed gap below. |
| No browser cron | PASS. The rail filter and the catalog/detail badge clear read `new Date()` once when that response arrives. The catalog tile reads `new Date()` again while painting `offersBadge`. Nothing reschedules price or badge changes. |
| No invented discount, hardcoded SKU/price, or Kotlin | PASS in product code. SKU and price literals appear only in unit fixtures. The diff has no `.kt` file. |

## Closed gap

The previous blocking gap is closed.

`ProductTileComponent` paints `Oferta` when `offer || product.offerRef`. On `master`, the catalog tile passed `[offer]="state.query.offersOnly"`, so “Sólo ofertas” was the badge when the search payload had no `offerRef`. `c512ef2` had removed that input.

`aaa1c19` puts the input back as `catalogOffersBadge`: `offersOnly && isApiOfferVisible(...)`. `isApiOfferVisible` is true when either bound is missing, blank, or one-sided, and true inside an open `[validFrom, validUntil)`. A closed or inverted window is false.

`CatalogStore.search` still maps with `withoutClosedOfferBadge` and does not drop the row. A closed window keeps the product and the API effective price, clears `offerRef`, and `offersBadge` is false, so the tile badge is off. A missing window with “Sólo ofertas” on leaves `offersBadge` true, so `Oferta` stays even when `offerRef` is null. With the checkbox off and no `offerRef`, the badge stays off, as on `master`.

The home rail is unchanged in this respect: membership is `isApiOfferVisible`, and the template still passes `[offer]="true"`. A closed window is omitted there. It is not omitted from the catalog grid.

## Validations

| Check | Result |
| --- | --- |
| Diff name-only and commit list | PASS, 2026-09-26. Product commits are `4d8f573`, `4f9fd8a`, `c512ef2`, and `aaa1c19`. Merge-base with `origin/master` is `6831a13`. |
| `npm test` in `frontend/` | PASS, 2026-09-26, worktree `StoreCore-pr26-scope-review` at `aaa1c19`. `npm test` → `ng test --watch=false`: 22 files, 64 tests, exit 0. The two new cases cover `catalogOffersBadge` for “Sólo ofertas” with no window, and for a closed window versus an open window. The suite still does not render a tile. The wiring is the view method above, which calls that helper and nothing else. |
| GitHub Verify run [36217022818](https://github.com/AgustinFalcon/storecore/actions/runs/36217022818) on `aaa1c19` | **Not CI green.** `frontend` (`108334897902`) and `backend` (`108334898083`) both completed `failure` in about 2 s (`2026-09-26T04:10:13Z`–`04:10:15Z`), `steps: []`. Both annotations say the job was not started because recent account payments failed or the spending limit needs to be increased. No test suite ran on GitHub. |

## Standards

StoreCore presentation stays container → view → ComponentStore → use case → HTTP repository (`sdd/PATTERNS.md`). The promo form stays a view; `UserStore` owns the window check and the instant conversion; `CatalogStore` owns the rail filter and the badge clear; `catalogOffersBadge` stays in `offer-window.ts`, free of Angular, and the catalog view only reads it. Commercial safety holds for the price fields: effective is still the selling price.

No backend file is in the diff. No new route, SDK, fiscal path, BlackStore client, secret, tag, deploy, or `/sdd.finish`.

## Gaps

None blocking. The catalog offers grid keeps `Oferta` when `offersOnly` is set and `isApiOfferVisible` is true. A closed window keeps the product and the API effective price and turns the badge off. The home rail still omits a closed window.

## Residual NO-GO

MP-LIVE-05, live credentials, fiscal/ARCA, BlackStore companion live, tag, deploy, publish, and `/sdd.finish` stay outside this PR. This verdict is scope only. No merge. No GitHub approve. CI is not green.
