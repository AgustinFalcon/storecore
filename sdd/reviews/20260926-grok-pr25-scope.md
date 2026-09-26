VERDICT: APPROVED

# Grok 4.7 — PR #25 scope

**Lane:** SCOPE
**PR:** https://github.com/AgustinFalcon/storecore/pull/25
**Title:** Mostrar los bloques del banner en la consola de contenido
**GitHub base:** `master` (`baseRefName=master`)
**Branch:** `feature/storecore-home-blocks`
**Fetched head:** `a2970dc987555076350988e09fe28372d3c991de` (`Re-read the public home after publish so the console does not keep the previous banner list.`)
**Earlier product commit:** `4a1760cb02461ae8e75f1d9df9a2891efc18eb22` left the pre-save list in place. `a2970dc` is the product tip.
**State when reviewed:** `OPEN`
**Reviewed diff:** `git diff origin/master...HEAD` (`6831a13...a2970dc`).
**No merge.** This file does not approve GitHub, does not call CI green, and does not authorize `/sdd.finish`.

Notes that say `APPROVED` against `7572278` or `644bb2a` do not cover this head. `4a1760c` re-introduced the empty-banner sentence and kept a stale `[]` after publish. This pass judges `a2970dc`.

## What was read

1. `gh pr view 25` after fetch (title, body, base `master`, state `OPEN`, head `a2970dc`).
2. Full `git diff origin/master...HEAD`, plus `git diff 4a1760c..HEAD` (`user.store.ts`, `user.store.spec.ts` only).
3. SDD why: `sdd/STATUS.md` (UX-ANG on the 22 existing routes; MP-LIVE-05, fiscal, and `/sdd.finish` stay NO-GO; a Verify job that never starts is not CI green). U-02 (`/user/content`, “Título + cuerpo → home HTTP”). `product-decision-home-carousels.md` (banner slides come from `GET /api/v1/content/home`; zero slides do not paint a region).
4. `sdd/PATTERNS.md`: container → view → ComponentStore → use case → HTTP repository.
5. `user-content.view.html`, `UserStore.loadHome` / `persistHome`, `mapHomeDraft`, `homeDraftSavePayload`, `GetHomeUseCase`, and `CatalogService.home()` / `adminHomeDraft()` / `saveHome()` on `master` (not in this diff).

`git grep` for `Este home no tiene bloques` under `*.html`, `*.ts`, and `*.kt` finds one line, in `user-content.view.html`.

## SDD why

`/user/content` lists the banner titles and bodies the public home is already serving, from the existing `GET /content/home`. Publish stays title + body on the existing `PUT /user/content/home`. No new endpoint and no Kotlin. The sentence «Este home no tiene bloques para el banner.» may appear only when `homeBlocks` is a present array of length 0, and only when the screen is not loading and has no error. An omitted `blocks` field must not print that sentence.

## Diff judged

```text
frontend/src/app/data/mappers/http-mappers.spec.ts
frontend/src/app/data/mappers/http-mappers.ts
frontend/src/app/data/user/user-http.repository.ts
frontend/src/app/domain/user/user.entity.ts
frontend/src/app/features/admin/user-content.view.html
frontend/src/app/features/admin/user-content.view.ts
frontend/src/app/features/admin/user.store.spec.ts
frontend/src/app/features/admin/user.store.ts
sdd/reviews/20260926-grok-pr25-scope.md
sdd/reviews/20260926-grok-pr25-sdd.md
```

No Kotlin, SQL, OpenAPI, `app.routes.ts`, `package.json`, `.github`, or storefront/cart/promo path. `mapHome` is untouched. `GetHomeUseCase` is already provided in `app.config.ts` and still calls `GET /content/home`.

## Scope checks

| Check | Result |
| --- | --- |
| Sentence only for a present `homeBlocks` array of length 0, while not loading and with no error | PASS. The section is `@if (!state.loading && !state.errorMessage && state.homeBlocks)`. The sentence is the inner `@if (state.homeBlocks.length === 0)`. An empty array is truthy, so that case prints it. `null` does not. Initial state is `homeBlocks: null`. `loadHome` and `persistHome` set `loading: true` before the request, so the section is hidden while a read is in flight. |
| An omitted `blocks` field does not print that sentence | PASS. `mapHomeDraft` leaves `blocks` off the draft when the field is not an array. `loadHome` does not copy the console draft’s `blocks`; it sets `homeBlocks` from the public read. A failed public read sets `homeBlocks` to `null` and `errorMessage`. After a successful save, `persistHome` ignores `blocks` on the PUT body and sets `homeBlocks` from a new `GetHomeUseCase` read. The store test starts from a public `[]`, saves `{ title, body }` with no `blocks`, and expects the second public read’s hero row. If that re-read fails, `homeBlocks` becomes `null` and `errorMessage` is set, so the sentence stays hidden. |
| Save stays title + body | PASS. `persistHome` executes `{ title, body }`. `homeDraftSavePayload` returns only those fields. `PUT /user/content/home` sends that object. `setHome` and the view `patch` keep the editable draft to title and body. `HomeRequest` / `HomeDraft` stay title + body. The new spec asserts the save call is exactly those two fields. |
| No new endpoint, no Kotlin | PASS. The extra read is the existing `GET /content/home`, including the post-save re-read. Console read and save stay `GET`/`PUT /user/content/home`. The diff has no `.kt` file. |
| Public carousel, catalog, promos, favorites, and cart stay | PASS. No storefront, cart, promo, or router file is in the diff. |
| Existing route only | PASS. The screen remains `/user/content`. The lede says this screen feeds the public home and is not the buyer account. |
| No payment SDK, fiscal code, secrets, tag, deploy, or `/sdd.finish` | PASS. No `package.json`, Kotlin, SQL, workflow, or archive move. |

`CatalogService.home()` always returns a `blocks` list from active `home_content_sections` rows. Zero rows is a present empty array, which is the case that shows the sentence. `saveHome` inserts an active `hero` when that row is missing. The post-save public read is what replaces the pre-save `[]`, so the sentence does not stay up after that insert.

## Validations

| Check | Result |
| --- | --- |
| Diff name-only and commit list | PASS, 2026-09-26. Merge-base with `origin/master` is `6831a13`. Fetched head `a2970dc` changes `user.store.ts` and `user.store.spec.ts` on top of `4a1760c`. |
| `npm test` in `frontend/` | PASS, 2026-09-26. `node_modules` is present. `ng test --watch=false` exited 0 on this head: 21 files, 53 tests, vitest duration 8.67s. Local pass only. The new store test covers a public `[]`, a save body of title + body, and the following public read. This local pass is not CI green. |
| GitHub Verify run [36218364090](https://github.com/AgustinFalcon/storecore/actions/runs/36218364090) on `a2970dc` | **Not CI green.** `backend` `108338768396` and `frontend` `108338768577` both completed `failure` in about 2–3 s (`2026-09-26T04:37:06Z`–`04:37:09Z`), `steps: []`. No test suite ran on GitHub. |
| GitHub Verify run [36216827777](https://github.com/AgustinFalcon/storecore/actions/runs/36216827777) on `4a1760c` | **Not CI green.** `backend` `108334331177` and `frontend` `108334331231` completed `failure` with `steps: []` and the billing annotation that the job was not started because recent account payments failed or the spending limit needs to be increased. |

## Standards

StoreCore presentation stays container → view → ComponentStore → use case → HTTP repository (`sdd/PATTERNS.md`). The content view stays presentational. `UserStore` owns `homeBlocks` and calls `GetHomeUseCase` plus `SaveHomeContentUseCase`. The public read is the catalog home use case, not a CUSTOMER session. This PR does not start a second state stack.

No backend or architecture file is in the diff, so those standards have nothing new to apply. No new forbidden surface (route, SDK, fiscal, BlackStore browser client, secret, tag, deploy, `/sdd.finish`).

## Gaps

Non-blocking. A failed save sets `errorMessage` and does not clear `homeBlocks`; the template still hides the section while that error is set. `forkJoin` on load still drops a successful console draft when the public read fails. The storefront rotates at most five blocks; the console lists the full public array. Unchanged `mapHome` turns a missing public `blocks` key into `[]`; live `home()` always emits the array. There is no store test for a failed post-save re-read; that path sets `homeBlocks` to `null`. U-02 still says “Título + cuerpo → home HTTP”; updating that inventory line is not a close-out.

## Residual NO-GO

MP-LIVE-05, live credentials, fiscal/ARCA, BlackStore companion live, tag, deploy, publish, and `/sdd.finish` stay outside this PR. The UX WIP stays under `sdd/wip/`. Verify runs `36218364090` and `36216827777` are not CI green. This verdict is scope only.
