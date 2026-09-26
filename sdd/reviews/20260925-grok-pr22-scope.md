VERDICT: APPROVED

# Grok 4.7 — PR #22 scope

**Lane:** SCOPE
**PR:** https://github.com/AgustinFalcon/storecore/pull/22
**Title:** Sync catalog filters with the query string
**GitHub base:** `master` (`baseRefName=master`)
**Branch:** `feature/storecore-catalog-query-url` @ `ce0c801` (`Sync catalog filters with the query string so home links stay shareable.`)
**Reviewed diff:** `git diff origin/master...ce0c801` (`6831a13...ce0c801`), one commit, 5 frontend files, +216 / −14
**No merge.** This file does not approve GitHub, does not call CI green, and does not authorize `/sdd.finish`.

## What was read

1. `gh pr view 22` (title, body, base `master`, head `ce0c801`, `changedFiles=5`, additions 216, deletions 14, Verify rollup).
2. Full `git diff origin/master...ce0c801`. The workspace `HEAD` is `24afdbb` on `feature/storecore-catalog-effective-price`. `git diff origin/master...HEAD` there is the effective-price Kotlin commit, not this PR. That tree was not reviewed. Dirty `EffectivePrice*.kt`, `CatalogService.kt`, `CatalogEffectiveOfferTest.kt`, and `docs/agent/` were left untouched.
3. SDD why: `sdd/STATUS.md` (checkout URL is UX; no fiscal, deploy, or `/sdd.finish`); `screen-inventory.md` P-02 `/catalog` toolbar; `product-decision-home-carousels.md` (home offers and category links).
4. At `ce0c801`, outside this diff: home and header already link with `offers: '1'`, `category`, and `q`; `CatalogHttpRepository` sets `offers=true` when `offersOnly`; `customer` and `user` `path: ''` still `redirectTo: 'session'`.

## SDD why

P-02 is the public catalog toolbar (search, brand, category, offers only). Home and header links must land on that toolbar through `q`, `brand`, `category`, and `offers=1`, including when `/catalog` is already open. Only `offers=1` means offers-only. The catalog HTTP call stays `offers=true`. STATUS still refuses fiscal/ARCA, a payment SDK, a live BlackStore companion, secrets, tag, deploy, publish, and `/sdd.finish`. This commit does not edit `sdd/`.

## Diff judged

```text
frontend/src/app/domain/catalog/catalog-query.entity.spec.ts
frontend/src/app/domain/catalog/catalog-query.entity.ts
frontend/src/app/features/storefront/catalog-page.component.spec.ts
frontend/src/app/features/storefront/catalog-page.component.ts
frontend/src/app/features/storefront/catalog-page.view.html
```

Commit `ce0c801` only. Same five paths GitHub reports. No `app.routes.ts`, `package.json`, backend, SQL, OpenAPI, `.github`, or other SDD path.

## Scope checks

| Check | Result |
| --- | --- |
| Route reuse reads `queryParamMap` | PASS. `ngOnInit` subscribes to `route.queryParamMap` and applies every emission. It no longer reads only `snapshot` on init. The container spec pushes a second `ParamMap` and the store query follows it. |
| Buscar writes the URL | PASS. `search()` lives on the container. The view form prevents the native submit and emits `searchSubmit`. Navigate uses `catalogQueryParams`, relative to the catalog route. |
| Retry when the URL is unchanged | PASS. If the normalized toolbar matches the current query string, `search()` calls `store.search()` and returns without `navigate`. Reintentar is the same `searchSubmit` output. |
| Empty params omitted | PASS. `catalogQueryParams` uses `null` for a blank `q`, `brand`, `category`, and for offers off. `@angular/router` 22.0.8 `removeEmptyProps` drops `null` and `undefined`. Default handling replaces the query string. |
| Offers flag is strict | PASS. `offersOnly` is true only when `params.get('offers') === '1'`. `offers=true` stays false. The written flag is `offers=1`. The HTTP repository, outside this diff, still sends `offers=true`. |
| Checkbox `name="offers"` | PASS. The offers `ngModel` checkbox inside the toolbar form now has `name="offers"`. The URL value still comes from the container (`1` or omitted). |
| Home and header links survive an open catalog | PASS. Existing links use `offers: '1'`, `category`, and `q`. A new query map replaces the toolbar, including clearing text when the link is only `?offers=1`. |
| Container writes the URL; domain stays free of Angular; no HTTP in the component | PASS. `catalog-query.entity.ts` has no imports. `catalogQueryFromParams` takes `{ get(name: string): string \| null }`. The component calls `CatalogStore.search` / `loadFacets`. The view only emits. |
| Customer and user index still go to session | PASS. `app.routes.ts` is not in the diff. Both empty paths remain `redirectTo: 'session'`. |
| No Bearer, BlackStore, hardcoded merchant, fiscal, or `/sdd.finish` | PASS. No `Authorization` header, BlackStore host, Kotlin, SQL, workflow, tag, or SDD archive edit. |

A URL change searches once: `search()` only navigates, and `applyRouteQuery` performs that search when `queryParamMap` emits. An unchanged URL searches once inside `search()` and does not navigate, so the subscriber does not run again.

## Validations

| Check | Result |
| --- | --- |
| Diff name-only and commit list | PASS, 2026-09-25. Five frontend files, one commit `ce0c801`. Merge-base with `origin/master` is `6831a13`. `gh pr view 22 --json baseRefName,additions,deletions,changedFiles` reports `master`, 5 files, +216 / −14. |
| `npm test` in `frontend/` at `ce0c801` | PASS, 2026-09-25. `ng test --watch=false`: 23 files, 55 tests. `Start at 23:52:04`, duration 7.17s. Matches the PR test plan. The workspace `frontend/` is not this commit, so the run used a detached checkout of `ce0c801`. |
| Browser walk in the PR body | Not re-run here. |
| GitHub Verify run [36212644430](https://github.com/AgustinFalcon/storecore/actions/runs/36212644430) on `ce0c801` | **Not CI green.** `backend` and `frontend` both completed `failure` in about 1–2 s (`2026-09-26T02:44:44Z`–`02:44:46Z`), `steps: []`. Annotation on both: the job was not started because recent account payments failed or the spending limit needs to be increased. No test suite ran on GitHub. |

## Standards

StoreCore presentation stays container → view → ComponentStore → use case → HTTP repository (`sdd/PATTERNS.md`). This diff keeps that split: the catalog container owns the router write and the query-param subscription; the view stays presentational; the store still calls the search use case. The domain helper does not import Angular.

No backend or architecture file is in the diff, so those standards have nothing new to apply. No new forbidden surface (route, SDK, fiscal, BlackStore browser client, secret, tag, deploy, `/sdd.finish`).

## Gaps

No query-string defect. Home links already on `master` use the keys this commit reads, empty filters are dropped by the router, and a repeated search on the same URL does not navigate and does not fetch twice.

## Residual NO-GO

MP-LIVE-05, live credentials, fiscal/ARCA, BlackStore companion live, tag, deploy, publish, and `/sdd.finish` stay outside this PR. This verdict is scope only.
