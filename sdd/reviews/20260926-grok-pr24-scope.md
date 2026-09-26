VERDICT: APPROVED

# Grok 4.7 — PR #24 scope

**Lane:** SCOPE
**PR:** https://github.com/AgustinFalcon/storecore/pull/24
**Title:** Keep favorites in this browser session
**GitHub base:** `master` (`baseRefName=master`)
**Branch:** `feature/storecore-favorites-ui` @ `ac7f8cd` (`Record the SDD honesty review of favorites PR 24.`)
**Reviewed diff:** `git diff origin/master...HEAD` (`6831a13...ac7f8cd`). Product behavior is `7809546` and `2cefd22`: 12 frontend files, +361 / −1. `618d7f5` and `ac7f8cd` add review markdown only.
**No merge.** This file does not approve GitHub, does not call CI green, and does not authorize `/sdd.finish`.

## What was read

1. `gh pr view 24` (title, body, base, head, commits, `statusCheckRollup`). Base is `master`. Head at judgment is `ac7f8cd17a2f0eff31d49cf33d060d0809c3e2b5`. The body says `/customer/favorites` stays behind `customerGuard`, the list lives only in this browser, and TODO-036 stays outside the WIP.
2. `sdd/STATUS.md`. UX-ANG is on the existing routes. Fiscal/ARCA, live credentials, tag, deploy, publish, and `/sdd.finish` stay refused. A GitHub Verify job that dies in about two seconds with no steps is a billing failure, not CI green.
3. SDD why for favorites: `sdd/backlog.md` TODO-036 is `[low] [deferred] Favorites`. `sdd/wip/20260923-storecore-frontend-ux-system-v1/1-functional/screen-inventory.md` lists favoritos under “Fuera de este WIP”. `sdd/TRACEABILITY.md` keeps favorites/loyalty/carriers as TODO-036..038 with no core DDL or task. This PR does not edit those files.
4. Full `git diff origin/master...HEAD`, including `git show 2cefd22` (the copy commit that drops the account-nav link). `customer.guard.ts` and `customer-layout.component.html` were read in the tree.

Allowed here: a heart, `sessionStorage`, `/customer/favorites` behind `customerGuard`, and copy that the list is not saved in the installation. Forbidden: Kotlin, Flyway, an API, a hardcoded SKU or price, Bearer, BlackStore, and presenting the mock as a closed product capability.

## SDD why

TODO-036 stays deferred. The screen inventory does not authorize an account wishlist or a record in the installation. STATUS still refuses fiscal/ARCA, a live BlackStore companion, secrets, tag, deploy, publish, and `/sdd.finish`. The product commits stay inside the browser mock: the heart writes `sessionStorage`, the guarded page says the list is a sketch and is not saved in the installation, and the customer nav does not list Favoritos.

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

`7809546` added a customer-nav link. `2cefd22` removed it. The net product diff has no `customer-layout.component.html`. Also in `origin/master...HEAD`, and outside this lane: `sdd/reviews/20260926-grok-pr24-scope.md` (this file) and `sdd/reviews/20260926-grok-pr24-sdd.md` (`ac7f8cd`). No `package.json`, backend, Kotlin, SQL, Flyway, OpenAPI, or `.github` path.

## Scope checks

| Check | Result |
| --- | --- |
| Browser-local mock only | PASS. `FAVORITES_STORAGE_KEY` is `storecore.ui.favorites`. `normalizeFavorites` keeps trimmed `sku` and `name` only. `session-favorites.spec.ts` writes an entry that also carries `price: 10`; the stored JSON is `[{"sku":"from-catalog","name":"From catalog"}]`. The spec strings (`from-catalog`, `a`, `keep`) prove the normalizer. They are not catalog constants. |
| `sessionStorage` | PASS. `browserFavoritesStorage()` returns `sessionStorage` after a probe `getItem`. If `sessionStorage` is missing or throws, the fallback is an in-tab `Map`. `toggle` writes that port and updates the signal. A refused `setItem` still updates the tab. The favorites files contain no `localStorage` call. |
| Route behind `customerGuard` | PASS. `path: 'favorites'` is a child of `customer` with `canActivate: [customerGuard]` and title `Favoritos`. The guard returns true for an authenticated customer session; otherwise it probes and sends a failed probe to `/customer/session`. `customer` `path: ''` and `user` `path: ''` still `redirectTo: 'session'`. `customer-layout.component.html` lists Perfil, Direcciones, and Órdenes. It has no Favoritos link. |
| Heart on card and detail | PASS. `sc-product-tile` and the product buy box render the heart and call `toggle` with `{ sku, name }` from the product already on screen. The list page removes the same entry through `remove` → `toggle`. The button is `type="button"` and sits outside the tile links. |
| Copy that it is not saved in the installation | PASS. Lede: `Boceto de la interfaz. Esta lista vive solo en este navegador y no queda guardada en la instalación.` Empty state: `Todavía no marcaste ningún producto en este navegador.` Heart labels: `Marcar en este navegador` / `Quitar de este navegador`. |
| Price stack unchanged | PASS. The tile still strikes `.sc-price__was` only when `product.originalPrice !== null` and still sells `product.price` as `Efectivo`. The detail still sells `product.price.effective`. Those price lines are outside the diff. The favorites list shows name and heart only. |
| OnPush | PASS. `CustomerFavoritesComponent`, `CustomerFavoritesViewComponent`, `ProductPageComponent`, `ProductPageViewComponent`, and `ProductTileComponent` use `ChangeDetectionStrategy.OnPush`. The favorites view stays presentational (`Input` / `Output` only). |
| No Kotlin, Flyway, API, hardcoded SKU/price, Bearer, BlackStore | PASS. `git diff origin/master...HEAD --name-only` for `*.kt`, `*.sql`, Flyway, OpenAPI, and `.github` is empty. Grep of `frontend/src/app/core/favorites` finds no `HttpClient`, `Bearer`, `BlackStore`, or `localStorage`. Catalog and account HTTP repositories are unchanged. There is no favorites endpoint. |

## Validations

| Check | Result |
| --- | --- |
| Diff name-only and commit list | PASS, 2026-09-26. Product files are the twelve paths above. Commits `7809546` and `2cefd22` carry the UI. Merge-base with `origin/master` is `6831a13`. |
| `npm test` in `frontend/` | PASS, 2026-09-26, this worktree. `ng test --watch=false` (Vitest 4.1.11). Exit 0. Bundle generation 5.035s at `2026-09-26T03:22:15.248Z`. Test files 22 passed (22). Tests 55 passed (55). Start `00:22:17`. Duration 34.43s. |
| `npm run check:architecture` in `frontend/` | PASS, 2026-09-26. `Architecture scan passed: Container → View → Store → UseCase → HTTP repository.` |
| GitHub Verify run [36214501747](https://github.com/AgustinFalcon/storecore/actions/runs/36214501747) on `ac7f8cd` | **Not CI green.** `backend` job `108327671105` started `2026-09-26T03:20:29Z` and finished `03:20:31Z`. `frontend` job `108327671257` started `2026-09-26T03:20:30Z` and finished `03:20:31Z`. Both `failure`, `steps: []`. Annotation: the job was not started because recent account payments have failed or the spending limit needs to be increased. No suite ran on GitHub. |

## Standards

StoreCore presentation stays container → view → store → use case → HTTP repository (`frontend/scripts/check-architecture.mjs`). The favorites view has no `ComponentStore`, `HttpClient`, or `UseCase`. The product page container owns `toggleFavorite`. The shared tile calls `FavoritesBrowserStore` directly; the architecture scan rejects that mix only inside `*.view.ts`, and this store does not open HTTP. The scan passed. No second state stack and no Bearer in the browser.

No backend file is in the diff, so backend and data standards have nothing new to apply. The diff adds no Kotlin, Flyway, endpoint, secret, BlackStore client, tag, deploy, or `/sdd.finish`.

## Gaps

None that require a code change. `sessionStorage` is per tab; the lede says the list lives in this browser and is not saved in the installation. That disclaimer is the allowed copy. TODO-036 remains deferred. This mock does not authorize an account wishlist, cross-device sync, or a later HTTP or database feature.

## Residual NO-GO

Favorites as a product feature (TODO-036), MP-LIVE-05, live credentials, fiscal/ARCA, a live BlackStore companion, tag, deploy, publish, and `/sdd.finish` stay outside this PR. This verdict is scope only. No merge. No GitHub approve. No CI green. No `/sdd.finish`.
