VERDICT: APPROVED

# Grok 4.7 — PR #21 scope

**Lane:** SCOPE
**PR:** https://github.com/AgustinFalcon/storecore/pull/21
**Title:** Show effective offers on the home and allowlist checkout redirects
**GitHub base:** `master` (`baseRefName=master`)
**Branch:** `feature/storecore-home-effective-offers` @ `4538484` (`Show home offers from the effective price and keep checkout redirects allowlisted.`)
**Reviewed diff:** `git diff origin/master...4538484` (`efc4964...4538484`), one commit, 14 frontend files, +139 / −100
**No merge.** This file does not approve GitHub, does not call CI green, and does not authorize `/sdd.finish`.

## What was read

1. `gh pr view 21` (title, body, base, head, files, the single commit, Verify rollup).
2. Full `git diff origin/master...4538484`.
3. SDD why: `sdd/STATUS.md` gate (checkout URL is UX, not payment proof; no fiscal, deploy, or `/sdd.finish`); `sdd/wip/20260923-storecore-frontend-ux-system-v1/1-functional/screen-inventory.md` (P-01 empty copy, P-03 “Entrar para agregar”); `product-decision-home-carousels.md` (banner, effective-price offers, category chips, empty home); UX plan (UX-ANG on existing routes, archive still blocked).
4. Prior checkout reviews `sdd/reviews/20260923-grok-pr16-frontend-sdd.md` and `sdd/reviews/20260923-grok-pr16-backend-security.md`: the old browser check was only an `https://` prefix. This PR adds the client origin allowlist those reviews said was still missing on the browser side.

The working tree also has untracked `EffectivePrice*.kt` and `docs/agent/`. They are outside `origin/master...4538484`. This review does not stage or edit them. Tracked files match `4538484` (`git diff 4538484` is empty).

## SDD why

P-01 is a content banner plus an offers rail priced at **effective**, with “Home configurable vacío.” when that home has nothing to show. A `checkoutUrl` may leave the app only as a same-window UX redirect, and only for an HTTPS origin the installation listed. The default list is empty, so the buyer stays on `/checkout/result/:orderId`. That redirect is not payment proof. STATUS still refuses a payment SDK, fiscal/ARCA, a live BlackStore companion, secrets, tag, deploy, publish, and `/sdd.finish`. This commit does not edit `sdd/`.

## Diff judged

```text
frontend/src/app/data/catalog/catalog-http.repository.spec.ts
frontend/src/app/data/mappers/http-mappers.spec.ts
frontend/src/app/data/mappers/http-mappers.ts
frontend/src/app/domain/catalog/product-summary.entity.ts
frontend/src/app/domain/catalog/use-cases/search-catalog.usecase.spec.ts
frontend/src/app/features/cart/cart.store.ts
frontend/src/app/features/storefront/catalog.store.ts
frontend/src/app/features/storefront/product-page.view.html
frontend/src/app/features/storefront/storefront-home.component.ts
frontend/src/app/features/storefront/storefront-home.view.html
frontend/src/app/features/storefront/storefront-home.view.ts
frontend/src/app/shared/product-tile.component.ts
frontend/src/environments/environment.ts
frontend/src/styles.scss
```

Commit `4538484` only. No `app.routes.ts`, `package.json`, backend, SQL, OpenAPI, `.github`, or other SDD path.

## Scope checks

| Check | Result |
| --- | --- |
| Home offers use the effective price | PASS. Home still loads `offersOnly: true` through the catalog HTTP port. `mapProductSummary` sells `price.effective` when `price` is an object, and a numeric `price` otherwise. The struck price is kept only when the API base/original is greater than that effective value. The tile labels the selling price “Efectivo”. |
| Empty home copy | PASS. `homeEmpty` is true only when loading and error are clear and the banner, offers, and categories are all empty. `sc-feature-status` then shows `Home configurable vacío.` |
| Content banner remains | PASS. Home blocks still render the carousel (about 420–480px, prev/next, ~6s, pause on hover/focus, reduced motion stops it). Zero slides do not paint the region. |
| HTTPS origin allowlist, default empty | PASS. `checkoutAllowedOrigins` is `[]`. `isAllowlistedCheckoutUrl` requires `https:` and `url.origin` in that list. Anything else, including a missing or unparsable URL, stays on `router.navigate(['/checkout/result', receipt.orderId])`. Assign is same-window. |
| Customer and user index still go to session | PASS. `app.routes.ts` is not in the diff. At `4538484`, `customer` `path: ''` and `user` `path: ''` are still `redirectTo: 'session'`. |
| No new routes | PASS. No router file in the diff. Product-page edits stay on existing `/catalog/:sku`. |
| No payment SDK | PASS. `package.json` / lockfile are unchanged. No Mercado Pago script or SDK import. The receipt mapper still stores `checkoutUrl` as an optional string. |
| No fiscal code | PASS. No Kotlin, SQL, or ARCA path in the diff. |
| No browser call to BlackStore | PASS. No BlackStore host, client, or fetch in the diff. Home reads stay on the existing home, catalog, and facets ports. Tile images use a URL the catalog payload already supplied. |
| No secrets, tag, deploy, or `/sdd.finish` | PASS. `environment.ts` adds only the empty origin list next to `apiBaseUrl: '/api/v1'`. No workflow, tag, deploy, or SDD archive edit. |

## Validations

| Check | Result |
| --- | --- |
| Diff name-only and commit list | PASS, 2026-09-25. Fourteen frontend files, one commit `4538484`. Merge-base with `origin/master` is `efc4964`. `gh pr view 21` reports the same 14 paths, +139 / −100. |
| `npm test` in `frontend/` | PASS, 2026-09-25. `ng test --watch=false`: 21 files, 49 tests. Matches the PR test plan. |
| Browser walk of `/` and an unlisted checkout origin | Not run. The empty-home and “stay in the app” boxes in the PR body are still unchecked. The unit suite covers the effective-price mapper, not `CartStore` navigation. |
| GitHub Verify run [36090476460](https://github.com/AgustinFalcon/storecore/actions/runs/36090476460) on `4538484` | **Not CI green.** `backend` and `frontend` both completed `failure` in about 2–3 s (`2026-09-25T03:28:10Z`–`03:28:13Z`), `steps: []`. Annotation on both: the job was not started because recent account payments failed or the spending limit needs to be increased. No test suite ran on GitHub. |

## Standards

StoreCore presentation stays container → view → ComponentStore → use case → HTTP repository (`sdd/PATTERNS.md`). This diff keeps that split: the home container only passes store fields; the view stays presentational; the cart store owns the redirect. The generic Angular NgRx folder layout is not the StoreCore pattern, and this PR does not start a second state stack.

No backend or architecture file is in the diff, so those standards have nothing new to apply. No new forbidden surface (route, SDK, fiscal, BlackStore browser client, secret, tag, deploy, `/sdd.finish`).

## Gaps

Non-blocking. `isAllowlistedCheckoutUrl` has no unit test, so the suite does not show an empty list, an `http:` URL, or a bad URL refusing to navigate. The implementation is fail-closed with the default `[]`. `mapReceipt` still accepts any non-empty checkout string; the origin gate is only at assign time.

The home still stores brand facets and no longer renders a brands block or an unfiltered product grid. P-01’s authorized pieces are the banner, the offers rail, and category chips, so that removal matches the screen inventory. The product page adds the existing-route copy “Entrar para agregar” and a SKU line; it does not add a route.

With the default list empty, a server-returned Mercado Pago URL does not leave the app until that installation configures `checkoutAllowedOrigins`. That is the requested default, and it is still not proof of payment.

## Residual NO-GO

MP-LIVE-05, live credentials, fiscal/ARCA, BlackStore companion live, tag, deploy, publish, and `/sdd.finish` stay outside this PR. This verdict is scope only.
