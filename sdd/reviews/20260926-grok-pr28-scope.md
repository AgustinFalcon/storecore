VERDICT: APPROVED

# Grok 4.7 — PR #28 scope

**Lane:** SCOPE
**PR:** https://github.com/AgustinFalcon/storecore/pull/28
**Title:** Integrate the storefront mock branches
**GitHub base:** `master` (`baseRefName=master`)
**Branch:** `integration/storefront-mock`
**SHA reviewed:** `00908d5f427a8a0bbb43ab9ca5e629a02c8e994b`
**Tip when the fast-forward was rejected:** `e25513ba7b6afcafe1d90eac2f68e8c77dee8893`. `git diff 00908d5..e25513b -- frontend` is empty. Commits after `00908d5` are review markdown only (`bc915f1`, `d3f86fd` rewrites `20260926-grok-pr25-scope.md`, `ed1b96e`, `e25513b`). The product tree judged here is the product tree on that tip. `sdd/reviews/20260926-grok-pr28-sdd.md` stays.
**Reviewed diff:** `git diff origin/master...00908d5` (merge-base `6831a135e9cb74627b995ca6f4472f757416b3f3`). 44 files, +2118 / −58. No backend path.
**No merge.** This file does not approve GitHub, does not call CI green, and does not authorize `/sdd.finish`.

`gh pr view 28` returned state `OPEN`, base `master`, and head `00908d5f427a8a0bbb43ab9ca5e629a02c8e994b`. After `git fetch origin integration/storefront-mock master`, `origin/integration/storefront-mock` was that same SHA. `770593c` is an ancestor. This note judges `00908d5`.

## Ancestors

Present on `00908d5`:

- PR 22 catalog query string: `ce0c801` (`Sync catalog filters with the query string so home links stay shareable.`)
- PR 26 promo datetime: `4d8f573`. Closed-window badge: `4f9fd8a` (`Clear the offer badge when a promo window is closed.`)
- PR 25 home banner blocks: `332a75d`. Public re-read after publish: `a2970dc` (`Re-read the public home after publish so the console does not keep the previous banner list.`)
- PR 24 favorites in `sessionStorage`: `7809546`

`git merge-base --is-ancestor` exit 0 for `4f9fd8a`, `a2970dc`, `ce0c801`, `4d8f573`, `332a75d`, and `7809546`.

Absent: `99f6daac98844356a7dba94d703a39c9c5d8850c` (`origin/feature/storecore-catalog-effective-price`) is not an ancestor (exit 1). `git diff origin/master...HEAD -- backend` is empty. `CatalogService.kt` at HEAD matches `origin/master`. The diff has no `EffectivePrice*` file and no Kotlin change. The only `EffectivePrice` string in the diff is a review note that left that tree unreviewed.

Offer-window follow-ups already named in the PR body are also ancestors: `19f869c` / `2f69289` (PR 27) and `742cbd3` (PR 29). Their net effect is the badge on the home rail, the catalog grid, and the product detail. They do not add a fifth product and they do not bring the Kotlin effective-price branch.

## What was read

1. `gh pr view 28 --json title,body,baseRefName,headRefOid,state`.
2. `git diff --stat origin/master...HEAD` and the conflict-prone surfaces: `user.store.ts` `persistHome`, `offer-window.ts` plus catalog/home/detail usage, `catalog-query.entity.ts`, `session-favorites.ts`.
3. SDD why: `sdd/STATUS.md`. UX-ANG stays on the existing routes. MP-LIVE-05, fiscal/ARCA, tag, deploy, publish, and `/sdd.finish` stay NO-GO. A Verify job that never starts is not CI green. The PR body: demo stack only, do not merge to master, no payment, no fiscal, favorites in this browser session, promo windows do not invent prices, PR 23 stays out.

## SDD why

This branch is a storefront mock stack for a walkthrough. It is not a master merge. The four product surfaces are the catalog query string (`q`, brand, category, `offers=1`), MANUAL promo day and hour with an offer-window badge, public home banner blocks with a re-read after publish, and favorites in `sessionStorage`. USER and CUSTOMER stay separate. Publish on `/user/content` still sends title and body. A closed window may clear the badge and may omit the card from the home offers rail. The catalog grid and the product detail keep the product and the API price.

## Diff judged

Frontend product paths plus prior review markdown. No payment, fiscal, tenancy, or Kotlin effective-price code.

Both required behaviors survive together in `user.store.ts` and `offer-window.ts`:

- `persistHome` saves title and body, then calls `publicHome.execute()` and replaces `homeBlocks` from that GET. A failed re-read sets `homeBlocks` to null and does not paint an empty banner list. `user.store.spec.ts` expects the second public read after save.
- `persistPromo` still sends a local day and hour as an instant and does not rewrite a price.
- Catalog `search` maps with `withoutClosedOfferBadge`. That helper clears `offerRef` when the window is closed and leaves `price` untouched. `catalog-page.view.html` renders `state.products` with no window filter. The grid spec keeps four tiles, including the closed window, and hides only `.sc-off`.
- The home offers rail filters with `isApiOfferVisible`. A closed window leaves that rail. A missing window stays. That is the home rail, not the catalog grid.
- `showsOfferBadge` / `catalogOffersBadge` return false outside `[validFrom, validUntil)`. `offersOnly` can mark a row that has no window. It cannot mark a row outside its own window.
- `mapProductSummary` copies API `effective` and sets `originalPrice` only when the payload base is already higher. The window does not write a new price. Detail `hasDiscount` compares API `base` and `effective`. A closed window does not synthesize a discount.
- `catalogQueryParams` / `catalogQueryFromParams` round-trip `q`, `brand`, `category`, and `offers=1`.
- Favorites use `sessionStorage` key `storecore.ui.favorites`. No HTTP and no account sync. `/customer/favorites` is the browser mock route.

## Validation

Junction only, not committed: `frontend/node_modules` → `C:\Users\agustin\Desktop\StoreCore-home-blocks-fix\frontend\node_modules`. Node `v24.19.0`. No `npm install`, so no `TAR_ENTRY_ERROR`.

```text
npx ng test --watch=false --include=src/app/domain/catalog/offer-window.spec.ts --include=src/app/domain/catalog/catalog-query.entity.spec.ts --include=src/app/core/favorites/session-favorites.spec.ts --include=src/app/features/admin/user.store.spec.ts --include=src/app/features/storefront/catalog-page.component.spec.ts --include=src/app/features/storefront/catalog-page.view.spec.ts --include=src/app/features/storefront/product-page.view.spec.ts --include=src/app/data/mappers/http-mappers.spec.ts
```

Result: `Test Files  8 passed (8)` / `Tests  45 passed (45)`. Duration 3.18s. Vitest v4.1.11.

## Gaps

None that change this verdict. This stack is still a demo branch. Do not merge it to `master` from this note. GitHub Verify was not treated as green. MP-LIVE-05, fiscal, tag, deploy, publish, and `/sdd.finish` stay refused.
