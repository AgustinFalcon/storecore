VERDICT: CHANGES_REQUIRED

# Grok 4.7 — PR #25 scope

**Lane:** SCOPE
**PR:** https://github.com/AgustinFalcon/storecore/pull/25
**Title:** Mostrar los bloques del banner en la consola de contenido
**GitHub base:** `master` (`baseRefName=master`)
**Branch:** `feature/storecore-home-blocks`
**PR head judged:** `4a1760cb02461ae8e75f1d9df9a2891efc18eb22` (`Show the public home banner blocks on the operator content screen.`)
**Reviewed diff:** `git diff origin/master...4a1760c` (merge-base `6831a13`).
**No merge.** This file does not approve GitHub, does not call CI green, and does not authorize `/sdd.finish`.

Older notes on this branch approve product commit `7572278`. That commit is an ancestor, and it is not the tip. `git diff 7572278..4a1760c -- frontend/` changes `user-content.view.html`, `user.store.ts`, and `user.store.spec.ts`. This review judges `4a1760c`.

## What was read

1. `gh pr view 25` (title, body, base `master`, state `OPEN`, head `4a1760cb02461ae8e75f1d9df9a2891efc18eb22`, Verify rollup).
2. Full `git diff origin/master...HEAD` at that tip.
3. SDD why: `sdd/STATUS.md` (UX-ANG on the 22 existing routes, not pixel-complete, not an archive; a `checkoutUrl` is not payment proof; MP-LIVE-05, fiscal, and `/sdd.finish` stay NO-GO; a Verify job that never starts is not CI green). `screen-inventory.md` U-02 (`/user/content`, “Título + cuerpo → home HTTP”). `product-decision-home-carousels.md` (public banner slides come from `GET /api/v1/content/home`; zero slides do not paint a region; no invented copy).
4. `sdd/PATTERNS.md` frontend path: container → view → ComponentStore → use case → HTTP repository. USER and CUSTOMER stay separate.
5. `UserStore.loadHome` / `persistHome`, `mapHomeDraft`, `homeDraftSavePayload`, `user-content.view.html`, and the existing `CatalogService.home()` / `saveHome` / `adminHomeDraft()` contracts outside the diff.

## SDD why

`/user/content` may list the banner titles and bodies the public home is already serving. That list is the existing `GET /content/home` through `GetHomeUseCase`. Publish stays title + body on the existing `PUT /user/content/home`. The public carousel, catalog, promos, favorites, and cart stay as they are. STATUS still refuses a new content API, a payment SDK, fiscal/ARCA, secrets, tag, deploy, publish, and `/sdd.finish`. U-02 still describes title + body; the read-only list does not add a route or a save field.

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

No Kotlin, SQL, OpenAPI, `app.routes.ts`, `package.json`, `.github`, or storefront/cart/promo path. `mapHome` is unchanged. `GetHomeUseCase` is already provided in `app.config.ts` and still calls `GET /content/home`.

## Scope checks

| Check | Result |
| --- | --- |
| Operator may show blocks the public home already returns | PASS on load. `loadHome` `forkJoin`s `SaveHomeContentUseCase.load()` with `GetHomeUseCase.execute()`. The form draft is `{ title, body }` from the console payload. `homeBlocks` is `published.blocks` mapped to id, title, and body. A console payload that omits `blocks` still shows that public list. |
| Empty sentence only while that public list is still empty | FAIL after publish. The sentence «Este home no tiene bloques para el banner.» renders when `state.homeBlocks.length === 0`. A successful load of a real public `[]` may show it. `persistHome` then keeps that array, so the sentence stays after Publicar has created the first active hero. |
| Public failure does not claim an empty banner | PASS. The error path sets `homeBlocks` to `null` and `errorMessage`. The section is inside `@if (!state.loading && !state.errorMessage && state.homeBlocks)`, so `null` hides the sentence. |
| PUT stays title + body | PASS. `persistHome` executes `{ title, body }`. `homeDraftSavePayload` returns only those fields. `PUT /user/content/home` sends that object. `setHome` and the view `patch` keep the editable draft to title and body. `HomeRequest` is still title + body. |
| No invented slides | PASS on the read path. Rows are id, title, and body from the public blocks. The console does not synthesize a hero from the form. |
| No new endpoint and no Kotlin | PASS. Public read is the existing catalog home GET. Save is the existing operator PUT. The diff has no `.kt` file. |
| Existing route only | PASS. The screen remains `/user/content`. |
| No payment SDK, fiscal code, secrets, tag, deploy, or `/sdd.finish` | PASS. No `package.json`, Kotlin, SQL, workflow, or archive move. |

## Required change

`CatalogService.saveHome` inserts `home_content_sections` key `hero` with `active=true` when that row is missing, then returns `HomeDraft` (title + body, no `blocks`). `adminHomeDraft()` uses the title `"StoreCore"` when there is no hero row, so the title gate allows Publicar while the public list is still `[]` and the sentence is on screen.

`persistHome` only replaces `homeBlocks` when the mapped PUT body has `blocks`. That body omits them, so the pre-save `[]` stays. The public `GET /content/home` would now return the new hero. The console still says the home has no banner blocks. The same path leaves an existing hero’s title and body stale after a later publish, while the lede says the public home is rotating that list.

After a successful save, re-read the existing public `GET /content/home` and set `homeBlocks` from that result, or set `homeBlocks` to `null` until that read returns. Keep the sentence hidden while the read is loading or in error. Do not build the list from the form title and body or from the console PUT body. Save stays `{ title, body }`. No new endpoint, no Kotlin, no invented slides.

## Validations

| Check | Result |
| --- | --- |
| Diff name-only and commit list | PASS, 2026-09-26. Merge-base with `origin/master` is `6831a13`. Judged head `4a1760cb02461ae8e75f1d9df9a2891efc18eb22`. |
| `npm test` in `frontend/` | PASS, 2026-09-26. `ng test --watch=false` exited 0: 21 files, 52 tests, duration 55.93s. Local pass only. The two new store tests cover a console payload that omits `blocks` and a failed public read. Neither covers a public `[]` nor the list after save. |
| GitHub Verify run [36216827777](https://github.com/AgustinFalcon/storecore/actions/runs/36216827777) on `4a1760c` | **Not CI green.** `backend` `108334331177` and `frontend` `108334331231` both completed `failure` in about 2 s (`2026-09-26T04:06:16Z`–`04:06:18Z`), `steps: []`. Annotation on both: the job was not started because recent account payments failed or the spending limit needs to be increased. No test suite ran on GitHub. |

## Standards

StoreCore presentation stays container → view → ComponentStore → use case → HTTP repository (`sdd/PATTERNS.md`). The content view stays presentational. `UserStore` owns `homeBlocks` and calls `GetHomeUseCase` plus `SaveHomeContentUseCase`. The public read is the catalog home use case, not a CUSTOMER session. The generic Angular NgRx folder layout is not the StoreCore pattern, and this PR does not start a second state stack.

No backend or architecture file is in the diff, so those standards have nothing new to apply. The required change is in the existing store effect. No new forbidden surface (route, SDK, fiscal, BlackStore browser client, secret, tag, deploy, `/sdd.finish`).

## Gaps

The required change above blocks approval.

Non-blocking. `forkJoin` fails the whole load when the public read fails, so a successful console draft is not applied and the form stays on the initial blank title and body while the error is shown. The empty sentence stays hidden in that case. The storefront rotates at most five blocks; the console lists the full public array, so the lede “está rotando” covers blocks the carousel does not show when there are more than five. `mapHome` turns a missing public `blocks` field into `[]`; live `home()` always emits the array, and this commit does not change `mapHome`. U-02 still says “Título + cuerpo → home HTTP”; updating that inventory line is not a close-out.

## Residual NO-GO

MP-LIVE-05, live credentials, fiscal/ARCA, BlackStore companion live, tag, deploy, publish, and `/sdd.finish` stay outside this PR. The UX WIP stays under `sdd/wip/`. Verify run `36216827777` is not CI green. This verdict is scope only.
