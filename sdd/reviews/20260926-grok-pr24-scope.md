VERDICT: APPROVED

# Grok 4.7 — PR #24 scope

**Lane:** SCOPE
**PR:** https://github.com/AgustinFalcon/storecore/pull/24
**Title:** Keep favorites in this browser session
**GitHub base:** `master` (`baseRefName=master`)
**Branch:** `feature/storecore-favorites-ui` @ `2cefd22` (`Say the favorites page is a browser mock, not an account list.`)
**Reviewed diff:** `git diff origin/master...2cefd22` (`6831a13...2cefd22`), two commits, 12 frontend files, +361 / −1
**No merge.** This file does not approve GitHub, does not call CI green, and does not authorize `/sdd.finish`.

## What was read

1. `gh pr view 24` (title, body, base, head, files). The first read reported head `780954606c3e12f2467993bda29280f2f20e9c37`. Before judgment the branch gained `2cefd22b0cbaeded3c3da3bcfd919f89828f2c00`, and `gh pr view 24` then reported that oid. This review judges the PR head that exists now, `origin/master...2cefd22`, which contains `7809546` plus the follow-up copy commit.
2. Full `git diff origin/master...2cefd22`, including `git show 2cefd22`.
3. SDD why: `sdd/STATUS.md` (UX-ANG on existing routes; no fiscal, deploy, or `/sdd.finish`; GitHub Verify that dies in seconds with no steps is billing). `sdd/wip/20260923-storecore-frontend-ux-system-v1/1-functional/screen-inventory.md` lists favoritos under “Fuera de este WIP”. `sdd/backlog.md` TODO-036 is `[deferred] Favorites`. Favorites are not an authorized product feature.
4. The allowed mock for this PR is only a heart on the card and the detail, `/customer/favorites` behind `customerGuard`, `sessionStorage`, and Spanish copy that the list is not saved in the installation. No Kotlin, Flyway, endpoint, hardcoded SKU or price, Bearer, or BlackStore.

The working tree matched `2cefd22` when the diff was judged (`git status -sb` clean aside from this review file).

## SDD why

TODO-036 stays deferred. The screen inventory does not authorize a wishlist, an account list, or persistence in the installation. STATUS still refuses fiscal/ARCA, a live BlackStore companion, secrets, tag, deploy, publish, and `/sdd.finish`. This commit pair does not edit `sdd/` except this review. The code stays inside the browser-local mock: the heart writes `sessionStorage`, the guarded page says the list is a mock and is not saved in the installation, and the customer nav does not present Favoritos as an account capability.

## Diff judged

```text
frontend/src/app/app.routes.ts
frontend/src/app/core/favorites/favorites-browser.store.ts
frontend/src/app/core/favorites/session-favorites.spec.ts
frontend/src/app/core/favorites/session-favorites.ts
frontend/src/app/features/identity/customer-favorites.component.ts
frontend/src/app/features/identity/customer-favorites.view.html
frontend/src/app/features/identity/customer-favorites.view.ts
frontend/src/app/features/storefront/product-page.component.ts
frontend/src/app/features/storefront/product-page.view.html
frontend/src/app/features/storefront/product-page.view.ts
frontend/src/app/shared/product-tile.component.ts
frontend/src/styles.scss
```

`7809546` added a customer-nav link. `2cefd22` removed it. The net diff has no `customer-layout.component.html`. No `package.json`, backend, Kotlin, SQL, Flyway, OpenAPI, or `.github` path.

## Scope checks

| Check | Result |
| --- | --- |
| Browser-local mock only | PASS. `FAVORITES_STORAGE_KEY` is `storecore.ui.favorites`. `writeBrowserFavorites` persists the normalized `{ sku, name }` list. The unit test passes a `price: 10` field and the stored JSON is `[{"sku":"from-catalog","name":"From catalog"}]`. Corrupt JSON, blanks, duplicates, and a throwing `getItem` become `[]`. |
| `sessionStorage` scope | PASS. `browserFavoritesStorage()` returns `sessionStorage` after a probe `getItem`. If `sessionStorage` is missing or throws, the fallback is a module `Map` in this tab. `toggle` does not call HTTP. A refused `setItem` still updates the in-tab signal. |
| Route behind `customerGuard` | PASS. `path: 'favorites'` is a child of `customer` with `canActivate: [customerGuard]`. That guard returns true only for an authenticated customer session; otherwise it probes and sends failures to `/customer/session`. The net diff does not add a Favoritos item to the customer nav. |
| Heart on card and detail | PASS. `sc-product-tile` (home offers and catalog) and the product buy box render the heart and call `toggle` with `{ sku, name }` from the product already on screen. The favorites page removes the same entry through `remove` → `toggle`. |
| Spanish copy, not an installation record | PASS. The page lede is `Boceto de la interfaz. Esta lista vive solo en este navegador y no queda guardada en la instalación.` Empty copy: `Todavía no marcaste ningún producto en este navegador.` |
| No HTTP on toggle | PASS. The diff has no `HttpClient`, `fetch(`, `localStorage`, `Authorization`, or `Bearer`. `FavoritesBrowserStore.toggle` only normalizes, writes the storage port, and sets the signal. |
| Price stack unchanged | PASS. The tile still strikes `.sc-price__was` only inside `@if (product.originalPrice !== null)` and still sells `product.price` as `Efectivo`. The detail still strikes `product.price.base` only when `hasDiscount` (`base > effective`) and still sells `product.price.effective`. `.sc-price__was` keeps `text-decoration: line-through`. Those lines are not in the diff. |
| OnPush | PASS. `CustomerFavoritesComponent`, `CustomerFavoritesViewComponent`, `ProductPageComponent`, `ProductPageViewComponent`, and `ProductTileComponent` use `ChangeDetectionStrategy.OnPush`. The favorites view stays presentational (`Input` / `Output` only). |
| No Kotlin, Flyway, endpoint, hardcoded SKU/price, Bearer, BlackStore, secrets | PASS. Twelve frontend files only. Spec SKUs (`from-catalog`, `a`, `keep`) exist to prove normalization, not as catalog prices. No credential, token, or BlackStore host. |

## Validations

| Check | Result |
| --- | --- |
| Diff name-only and commit list | PASS, 2026-09-26. Twelve frontend files, commits `7809546` and `2cefd22`. Merge-base with `origin/master` is `6831a13`. |
| `npm test` in `frontend/` | PASS, 2026-09-26. `ng test --watch=false` (Vitest 4.1.11): 22 files, 55 tests, exit 0, duration 9.01s. The new file is `session-favorites.spec.ts` (6 tests). |
| GitHub Verify run [36214223198](https://github.com/AgustinFalcon/storecore/actions/runs/36214223198) on `2cefd22` | **Not CI green.** `frontend` and `backend` both completed `failure` in about 2–3s (`2026-09-26T03:15:09Z`–`03:15:12Z`), `steps: []`. Annotation on the job: it was not started because recent account payments failed or the spending limit needs to be increased. No test suite ran on GitHub. The earlier run [36214089442](https://github.com/AgustinFalcon/storecore/actions/runs/36214089442) on `7809546` failed the same way (`03:12:35Z`–`03:12:37Z`, `steps: 0`). |

## Standards

StoreCore presentation stays container → view → store → use case → HTTP repository (`sdd/PATTERNS.md`, `frontend/scripts/check-architecture.mjs`). The favorites page view has no `ComponentStore`, `HttpClient`, or `UseCase`. The product page container owns `toggleFavorite`. The shared tile calls `FavoritesBrowserStore` directly; the architecture scan only rejects that mix inside `*.view.ts`, and this store does not open HTTP. No second state stack and no Bearer in the browser.

No backend or architecture file is in the diff, so those standards have nothing new to apply. No new forbidden surface (Kotlin, Flyway, endpoint, secret, BlackStore client, tag, deploy, `/sdd.finish`).

## Gaps

None that require a code change. TODO-036 remains deferred: this mock is not an account wishlist and does not authorize a later HTTP or database feature by inference.

## Residual NO-GO

Favorites as a product feature (TODO-036), MP-LIVE-05, live credentials, fiscal/ARCA, BlackStore companion live, tag, deploy, publish, and `/sdd.finish` stay outside this PR. This verdict is scope only.
