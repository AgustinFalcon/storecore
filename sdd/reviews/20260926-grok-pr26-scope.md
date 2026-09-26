VERDICT: CHANGES_REQUIRED

# Grok 4.7 — PR #26 scope

**Lane:** SCOPE
**PR:** https://github.com/AgustinFalcon/storecore/pull/26
**Title:** Promos MANUAL con día y hora
**GitHub base:** `master` (`baseRefName=master`)
**Branch:** `feature/storecore-promo-hours` @ `751c1f1` (`Record the SDD honesty review for promo window PR 26.`)
**Product commit judged:** `4d8f573` (`Let the operator type a promo window with day and hour.`)
**Reviewed diff:** `git diff origin/master...HEAD`. Product behavior is `6831a13...4d8f573` (11 frontend files, +246 / −20). `751c1f1` adds only `sdd/reviews/20260926-grok-pr26-sdd.md` and is the other lane.
**No merge.** This file does not approve GitHub, does not call CI green, and does not authorize `/sdd.finish`.

## What was read

1. `gh pr view 26` (title, body, base, head at review start `4d8f573`, file list, Verify rollup).
2. Full `git diff origin/master...HEAD` after the SDD-lane commit, plus `git show 4d8f573` for the product files.
3. SDD why: `sdd/STATUS.md` (UX-ANG on existing routes; fiscal/ARCA, tag, deploy, publish, and `/sdd.finish` stay refused); `sdd/wip/20260923-storecore-frontend-ux-system-v1/1-functional/screen-inventory.md` (U-04 `/user/promos`, MANUAL vigencia); `product-decision-home-carousels.md` (offers rail sells effective, struck price only for a real discount, offer badge on the card); `sdd/PATTERNS.md` (base, desired, observed, and effective stay distinct; MANUAL writer and ML automation stay exclusive).
4. Surfaces the product commit does not gate: `product-tile.component.ts`, `catalog-page.view.html`, `product-page.view.html`, `mapProductDetail`, and the catalog search row in `JdbcCatalogService.search` (read only; not in the diff).

Uncommitted edits in `offer-window.ts`, `offer-window.spec.ts`, and `catalog.store.ts` were present in the worktree and are outside `origin/master...HEAD`. They were not staged and are not the implementation under review.

## SDD why

`/user/promos` stays the MANUAL writer for this installation’s calendar, with day and hour, and with no Mercado Libre automation. The storefront keeps the price the API already called effective. A window the catalog sends may hide the offer badge and drop the card from the home offers rail, and only then. A missing window must leave the API offer as sent. STATUS still refuses fiscal/ARCA, live credentials, tag, deploy, publish, and `/sdd.finish`.

## Diff judged

```text
frontend/src/app/data/mappers/http-mappers.spec.ts
frontend/src/app/data/mappers/http-mappers.ts
frontend/src/app/domain/catalog/offer-window.spec.ts
frontend/src/app/domain/catalog/offer-window.ts
frontend/src/app/domain/catalog/product-summary.entity.ts
frontend/src/app/features/admin/user-promos.view.html
frontend/src/app/features/admin/user-promos.view.ts
frontend/src/app/features/admin/user.store.spec.ts
frontend/src/app/features/admin/user.store.ts
frontend/src/app/features/storefront/catalog.store.ts
frontend/src/app/features/storefront/storefront-home.view.html
sdd/reviews/20260926-grok-pr26-sdd.md
```

No `app.routes.ts`, `package.json`, Kotlin, SQL, OpenAPI, or `.github` path. No `setInterval` or `setTimeout` added. The existing home carousel timer is not in this diff.

## Scope checks

| Check | Result |
| --- | --- |
| `/user/promos` uses `datetime-local` | PASS. Desde and Hasta are `type="datetime-local"`. The table prints installation local day and hour through `clock()`. `promoForApi` sends those values as ISO instants. `writer` stays `MANUAL`. |
| Until must be after from | PASS. `isValidOfferWindow` requires a parsed end strictly after the start. `persistPromo` sets `Hasta tiene que ser posterior a desde.` and the effect filter skips `save`, so there is no POST. Equal and inverted drafts are covered. Empty fields still use the existing required-field message. API error and retry stay on the existing `tapResponse` / `loadPromos` path. |
| Storefront keeps the API effective price | PASS. `mapProductSummary` still sells `price.effective`, or a numeric `price`. Struck `originalPrice` stays only when the API base/original is greater than that effective value. The tile prints `product.price`. Product detail still prints `product.price.effective`. Nothing in the diff recomputes base, observed, or a discount. |
| Home offers rail hides only for a closed window | PASS for membership. `loadStorefront` keeps an offer unless both bounds parse and `now` is outside `[validFrom, validUntil)`. A missing, blank, or one-sided window stays on the rail. |
| Offer badge hides only for that same window | FAIL. See Gaps. |
| Missing window must not hide an API offer | FAIL for the home badge. The rail card stays. The badge does not. |
| No browser cron | PASS. The rail reads `new Date()` once when home data arrives. Nothing reschedules price or badge changes. |
| No invented discount, hardcoded SKU/price, or Kotlin | PASS in product code. SKU and price literals appear only in unit fixtures. The diff has no `.kt` file. |

## Validations

| Check | Result |
| --- | --- |
| Diff name-only and commit list | PASS, 2026-09-26. Product commit `4d8f573` matches the 11 frontend paths and +246 / −20 from `gh pr view 26` at review start. Later commit `751c1f1` is the SDD review file only. |
| `npm test` in `frontend/` | PASS, 2026-09-26, against the committed product tree before the uncommitted worktree edits. `ng test --watch=false`: 22 files, 58 tests. The new cases cover the mapper window, `isApiOfferVisible`, and the promo POST guard. They do not render a tile, a catalog card, or a product page. |
| GitHub Verify run [36214199065](https://github.com/AgustinFalcon/storecore/actions/runs/36214199065) on `4d8f573` | **Not CI green.** `frontend` and `backend` both completed `failure` in about 2–3 s (`2026-09-26T03:14:42Z`–`03:14:45Z`), `steps: []`. Check-run annotations on both: the job was not started because recent account payments failed or the spending limit needs to be increased. No test suite ran on GitHub. |

## Standards

StoreCore presentation stays container → view → ComponentStore → use case → HTTP repository (`sdd/PATTERNS.md`). The promo form stays a view; `UserStore` owns the window check and the instant conversion; `offer-window.ts` stays free of Angular. Commercial safety holds for the price fields: effective is still the selling price.

No backend file is in the diff. No new route, SDK, fiscal path, BlackStore client, secret, tag, deploy, or `/sdd.finish`.

## Gaps

Blocking. The offer badge is hidden for a reason other than a closed window, and it is not hidden on every surface that paints it when the window is closed.

The home rail used to pass `[offer]="true"`, so every card from `offers=true` showed `Oferta`. `4d8f573` removes that input. `ProductTileComponent` paints the badge only when `offer || product.offerRef`. `JdbcCatalogService.search` still returns `sku`, `name`, and `price` only, so the mapped summary has no `offerRef` and no window. `isApiOfferVisible` then correctly leaves the card on the rail, and the badge is gone anyway. A missing window must not do that.

When a payload does include both bounds and `now` is outside them, the home rail drops the whole card. These surfaces still show the badge, and they still show the API effective price:

- `catalog-page.view.html` renders every search hit and sets `[offer]="state.query.offersOnly"`. “Sólo ofertas” forces the badge. With the checkbox off, `offerRef` alone is still enough. `CatalogStore.search` stores `products` as the API returned them.
- `product-page.view.html` shows `oferta {{ product.offerRef }}` whenever `offerRef` is set. `mapProductDetail` does not read `validFrom` or `validUntil`, and `ProductDetail` has no window fields, so a window on that payload never reaches the badge.

The unchecked test-plan line “badge y rail solo adentro; afuera se mantiene el effective, sin badge y fuera del rail” holds for rail membership and for the price. It does not hold for the badge.

## Residual NO-GO

MP-LIVE-05, live credentials, fiscal/ARCA, BlackStore companion live, tag, deploy, publish, and `/sdd.finish` stay outside this PR. This verdict is scope only. No merge. No GitHub approve. CI is not green.
