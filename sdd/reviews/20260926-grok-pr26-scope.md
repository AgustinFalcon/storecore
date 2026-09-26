VERDICT: APPROVED

# Grok 4.7 — PR #26 scope

**Lane:** SCOPE
**PR:** https://github.com/AgustinFalcon/storecore/pull/26
**Title:** Promos MANUAL con día y hora
**GitHub base:** `master` (`baseRefName=master`)
**Branch:** `feature/storecore-promo-hours`
**PR head confirmed before this note:** `aaa1c19d3460d82e3b8df07974b9ae8deba6e203` (`Keep the catalog Oferta badge when the API sends no promo window.`). `gh pr view 26` returned that `headRefOid`, state `OPEN`. This note is the only file added after that commit.
**Product tree judged:** `aaa1c19` on top of `c512ef2ae883214d0665901503887f4c3ea9e782`. `git diff origin/master...aaa1c19`. Merge-base with `origin/master` is `6831a135e9cb74627b995ca6f4472f757416b3f3`.
**Prior scope note:** `8ff20e07186ad6c98908f475de1cbd2a774abbee` recorded `VERDICT: CHANGES_REQUIRED` against product commit `c512ef2`. The catalog grid hid `Oferta` when the payload had no window, because `[offer]="state.query.offersOnly"` had been removed. `aaa1c19` is the follow-up. This file replaces that note.
**No merge.** This file does not approve GitHub, does not call CI green, and does not authorize `/sdd.finish`.

## What was read

1. `gh pr view 26` (title, body, base, commits, head). Confirmation in this re-review: `headRefOid=aaa1c19d3460d82e3b8df07974b9ae8deba6e203`, state `OPEN`.
2. Full `git diff origin/master...HEAD` at `aaa1c19`, plus `git show aaa1c19`.
3. SDD why: `sdd/STATUS.md` (UX-ANG on existing routes; fiscal/ARCA, tag, deploy, publish, and `/sdd.finish` stay refused while MP-LIVE-05 is open). The PR body: MANUAL writer with day and hour, effective price unchanged, missing window stays as the API sent it, closed window hides the badge and leaves the home rail.
4. Surfaces named for this gap: `catalog-page.view.html`, `catalog-page.view.ts`, `catalogOffersBadge`, `isApiOfferVisible`, `withoutClosedOfferBadge`, `storefront-home.view.html`. Also `product-tile.component.ts`, `product-page.view.html`, `CatalogStore.loadStorefront` / `search` / `loadProduct`, and the `/user/promos` form and `UserStore` guard.

## SDD why

`/user/promos` stays the MANUAL writer for this installation’s calendar, with day and hour, and with no Mercado Libre automation. The storefront keeps the price the API already called effective. A window the catalog sends may hide the offer badge and drop the card from the home offers rail, and only then. A missing window must leave the API offer as sent. The catalog “Sólo ofertas” badge is on only when that filter is set and `isApiOfferVisible` is true. STATUS still refuses fiscal/ARCA, live credentials, tag, deploy, publish, and `/sdd.finish`.

## Diff judged

Net `origin/master...aaa1c19` frontend product paths (13 files, +377 / −22). Review markdown is not product code.

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

`aaa1c19` itself changes only `offer-window.ts`, `offer-window.spec.ts`, `catalog-page.view.html`, and `catalog-page.view.ts` (4 files, +34 / −3).

`storefront-home.view.html` is not in the net diff. Every card that remains on the rail still receives `[offer]="true"`.

No `app.routes.ts`, `package.json`, Kotlin, SQL, OpenAPI, or `.github` path. No `setInterval` or `setTimeout` added. The existing home carousel timer is not in this diff.

## Scope checks

| Check | Result |
| --- | --- |
| `/user/promos` uses `datetime-local` | PASS. Desde and Hasta are `type="datetime-local"`. The table prints installation local day and hour through `clock()`. `promoForApi` sends those values as ISO instants. `writer` stays `MANUAL`. |
| Until must be after from | PASS. `isValidOfferWindow` requires a parsed end strictly after the start. `persistPromo` sets `Hasta tiene que ser posterior a desde.` and the effect filter skips `save`, so there is no POST. |
| Storefront keeps the API effective price | PASS. The tile prints `product.price`. Product detail prints `product.price.effective`. `withoutClosedOfferBadge` copies the product and changes only `offerRef`. |
| Home offers rail drops a closed window and keeps the badge when the window is missing | PASS. `loadStorefront` keeps an offer unless both bounds parse and `now` is outside `[validFrom, validUntil)`. The template passes `[offer]="true"`. |
| Product detail clears only a closed-window badge | PASS. `loadProduct` maps with `withoutClosedOfferBadge`. A closed window clears `offerRef` and the page falls through to `sin oferta`. The product and `price.effective` stay. A missing window returns the same object. |
| Catalog grid: `[offer]` is true only when `offersOnly` and `isApiOfferVisible` | PASS. See the closed gap below. |
| Missing window stays visible; closed window stays off; product and effective price stay | PASS. |
| No browser cron | PASS. The rail reads `new Date()` when the home response arrives. The catalog badge reads `new Date()` when the tile binding runs. Nothing reschedules price or badge changes. |
| No invented discount, hardcoded SKU/price, or Kotlin | PASS in product code. SKU and price literals appear only in unit fixtures. The diff has no `.kt` file. |

## Closed gap

`ProductTileComponent` paints `Oferta` when `offer || product.offerRef`. The catalog grid now passes `[offer]="offersBadge(product)"`. That method returns `catalogOffersBadge(state.query.offersOnly, product.validFrom, product.validUntil, new Date())`, and `catalogOffersBadge` is `offersOnly && isApiOfferVisible(...)`.

`isApiOfferVisible` stays true when either bound is missing, blank, or unparsable, including a one-sided window. It stays false when both bounds parse and `now` is outside `[validFrom, validUntil)`, and when the window is inverted. Search still maps with `withoutClosedOfferBadge`, so a closed window keeps the row and the effective price and clears only `offerRef`. The tile cannot revive `Oferta` from a leftover `offerRef`. With “Sólo ofertas” on and no window, `[offer]` is true even when the payload has no `offerRef`. With the filter off, `[offer]` is false.

The home rail is unchanged by `aaa1c19`. It can keep `[offer]="true"` because `loadStorefront` already drops a closed window.

## Validations

| Check | Result |
| --- | --- |
| Diff name-only and commit list | PASS, 2026-09-26. Product commits on the branch are `4d8f573`, `4f9fd8a`, `c512ef2`, and `aaa1c19`. Frontend product net diff: 13 files, +377 / −22. |
| `npm test` in `frontend/` | PASS, 2026-09-26, against `aaa1c19` in `C:\Users\agustin\Desktop\StoreCore-pr26-scope-review`. `npm test` → `ng test --watch=false`: 22 files, 64 tests, exit 0. Duration 9.65s. The two new cases cover `catalogOffersBadge(true, null, null)` and a closed window with the filter on. |
| GitHub Verify run [36217022818](https://github.com/AgustinFalcon/storecore/actions/runs/36217022818) on `aaa1c19` | **Not CI green.** `frontend` (`108334897902`) and `backend` (`108334898083`) both completed `failure` in about 2 s (`2026-09-26T04:10:13Z`–`04:10:15Z`), `steps: []`. The frontend annotation says the job was not started because recent account payments failed or the spending limit needs to be increased. No test suite ran on GitHub. |

## Standards

StoreCore presentation stays container → view → ComponentStore → use case → HTTP repository. The promo form stays a view; `UserStore` owns the window check and the instant conversion; `CatalogStore` owns the rail filter and the badge clear; `offer-window.ts` stays free of Angular. The catalog view only asks `catalogOffersBadge` whether the checkbox badge is on. Commercial safety holds for the price fields: effective is still the selling price.

No backend file is in the diff. No new route, SDK, fiscal path, BlackStore client, secret, tag, deploy, or `/sdd.finish`.

## Gaps

None blocking. The catalog checkbox gap from `8ff20e0` is closed by `aaa1c19`.

## Residual NO-GO

MP-LIVE-05, live credentials, fiscal/ARCA, BlackStore companion live, tag, deploy, publish, and `/sdd.finish` stay outside this PR. This verdict is scope only. No merge. No GitHub approve. CI is not green.
