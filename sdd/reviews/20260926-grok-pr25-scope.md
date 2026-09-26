VERDICT: APPROVED

# Grok 4.7 — PR #25 scope

**Lane:** SCOPE
**PR:** https://github.com/AgustinFalcon/storecore/pull/25
**Title:** Mostrar los bloques del banner en la consola de contenido
**GitHub base:** `master` (`baseRefName=master`)
**Branch:** `feature/storecore-home-blocks`
**PR head judged:** `a2970dc987555076350988e09fe28372d3c991de` (`Re-read the public home after publish so the console does not keep the previous banner list.`)
**Reviewed diff:** `git diff origin/master...a2970dc` (merge-base `6831a13`).
**No merge.** This file does not approve GitHub, does not call CI green, and does not authorize `/sdd.finish`.

`gh pr view 25` at the start of this review reported head `a2970dc987555076350988e09fe28372d3c991de` and state `OPEN`. The previous scope note on this path required a change at `4a1760c`. That commit is an ancestor. `a2970dc` is the product tip. Focused store spec at a2970dc: 1 file, 7 tests.

## What was read

1. `gh pr view 25` (title, body, base `master`, state `OPEN`, head `a2970dc987555076350988e09fe28372d3c991de`, Verify rollup).
2. Full `git diff origin/master...a2970dc`.
3. SDD why: `sdd/STATUS.md` (UX-ANG on the 22 existing routes, not pixel-complete, not an archive; a `checkoutUrl` is not payment proof; MP-LIVE-05, fiscal, and `/sdd.finish` stay NO-GO; a Verify job that never starts is not CI green). `screen-inventory.md` U-02 (`/user/content`, “Título + cuerpo → home HTTP”). `product-decision-home-carousels.md` (public banner slides come from `GET /api/v1/content/home`; zero slides do not paint a region; no invented copy).
4. `sdd/PATTERNS.md` frontend path: container → view → ComponentStore → use case → HTTP repository. USER and CUSTOMER stay separate.
5. `UserStore.loadHome` / `persistHome`, `mapHomeDraft`, `homeDraftSavePayload`, `user-content.view.html`, and the existing `CatalogService.home()` / `saveHome` / `adminHomeDraft()` and `HomeRequest` contracts outside the diff.

## SDD why

`/user/content` may list the banner titles and bodies the public home is already serving. That list is the existing `GET /content/home` through `GetHomeUseCase`. Publish stays title + body on the existing `PUT /user/content/home`. After a successful publish the console re-reads that public GET and replaces the list. The public carousel, catalog, promos, favorites, and cart stay as they are. STATUS still refuses a new content API, a payment SDK, fiscal/ARCA, secrets, tag, deploy, publish, and `/sdd.finish`. U-02 still describes title + body; the read-only list does not add a route or a save field.

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

No Kotlin, SQL, OpenAPI, `app.routes.ts`, `package.json`, `.github`, or storefront/cart/promo path. `mapHome` is unchanged. `GetHomeUseCase` is already provided in `app.config.ts` and still calls `GET /content/home` through `CatalogHttpRepository.readHome`.

## Scope checks

| Check | Result |
| --- | --- |
| Operator may show blocks the public home already returns | PASS. `loadHome` `forkJoin`s `SaveHomeContentUseCase.load()` with `GetHomeUseCase.execute()`. The form draft is `{ title, body }` from the console payload. `homeBlocks` is `published.blocks` mapped to id, title, and body. A console payload that omits `blocks` still shows that public list. |
| After a successful publish, the list is the new public read | PASS. `persistHome` sends `{ title, body }`, then `switchMap`s to `publicHome.execute()`. The success patch sets `homeBlocks` from `published.blocks` only. It does not keep the pre-save array and does not read `blocks` off the console draft or the PUT body. `CatalogService.saveHome` still inserts `section_key='hero'` with `active=true` when that row is missing and returns a title+body draft, so the following public GET is what can show the new hero. |
| Empty sentence only for a successful public `[]` | PASS. The sentence «Este home no tiene bloques para el banner.» renders only when `!state.loading && !state.errorMessage && state.homeBlocks && state.homeBlocks.length === 0`. A successful load or re-read of a real public `[]` may show it. While `loading` is true, or `errorMessage` is set, the section stays hidden. The post-save public failure sets `homeBlocks` to `null` and `errorMessage`, so the pre-save `[]` is not painted. |
| Public failure does not claim an empty banner | PASS. Load error sets `homeBlocks` to `null` and `errorMessage`. A failed re-read after a successful PUT does the same. A failed PUT sets `errorMessage` and does not assign `homeBlocks`; the sentence stays hidden because `errorMessage` is set. |
| PUT stays title + body | PASS. `persistHome` executes `{ title, body }`. `homeDraftSavePayload` returns only those fields. `PUT /user/content/home` sends that object. `setHome` and the view `patch` keep the editable draft to title and body. `HomeRequest` is still title + body. |
| No invented slides | PASS. Rows are id, title, and body from the public blocks. The console does not synthesize a hero from the form. |
| No new endpoint and no Kotlin | PASS. Public read is the existing catalog home GET. Save is the existing operator PUT. The diff has no `.kt` file. |
| Existing route only | PASS. The screen remains `/user/content` (`user` → `content`). `app.routes.ts` is not in the diff. |
| No payment SDK, fiscal code, secrets, tag, deploy, or `/sdd.finish` | PASS. No `package.json`, Kotlin, SQL, workflow, or archive move. |

## Validations

| Check | Result |
| --- | --- |
| Diff name-only and commit list | PASS, 2026-09-26. Merge-base with `origin/master` is `6831a13`. Judged product head `a2970dc987555076350988e09fe28372d3c991de`. |
| `ng test --watch=false --include=src/app/features/admin/user.store.spec.ts` in `frontend/` | PASS, 2026-09-26. `node_modules` is present. Exited 0: 1 file, 7 tests, duration 13.12s. Local pass only. The home-block tests cover a console payload that omits `blocks`, a re-read that replaces a public `[]` after save, and `homeBlocks: null` when the public read fails on load. |
| GitHub Verify run [36218364090](https://github.com/AgustinFalcon/storecore/actions/runs/36218364090) on `a2970dc` | **Not CI green.** `backend` `108338768396` completed `failure` (`2026-09-26T04:37:06Z`–`04:37:09Z`, `steps: 0`). `frontend` `108338768577` completed `failure` (`2026-09-26T04:37:06Z`–`04:37:08Z`, `steps: 0`). Annotation on both: the job was not started because recent account payments failed or the spending limit needs to be increased. No test suite ran on GitHub. |

## Standards

StoreCore presentation stays container → view → ComponentStore → use case → HTTP repository (`sdd/PATTERNS.md`). The content view stays presentational. `UserStore` owns `homeBlocks` and calls `GetHomeUseCase` plus `SaveHomeContentUseCase`. The public read is the catalog home use case, not a CUSTOMER session. The generic Angular NgRx folder layout is not the StoreCore pattern, and this PR does not start a second state stack.

No backend or architecture file is in the diff, so those standards have nothing new to apply. No new forbidden surface (route, SDK, fiscal, BlackStore browser client, secret, tag, deploy, `/sdd.finish`).

## Gaps

None that block this scope verdict.

Non-blocking. `forkJoin` fails the whole load when the public read fails, so a successful console draft is not applied and the form stays on the initial blank title and body while the error is shown. The empty sentence stays hidden in that case. The storefront rotates at most five blocks (`storefront-home.view.ts` slices the public blocks to five); the console lists the full public array, so the lede “está rotando” covers blocks the carousel does not show when there are more than five. `mapHome` turns a missing public `blocks` field into `[]`; live `home()` always emits the array, and this commit does not change `mapHome`. A failed PUT leaves the previous `homeBlocks` in memory while `errorMessage` hides the section. The store spec does not cover the post-save public failure; that path is the `catchError` that sets `homeBlocks` to `null`. U-02 still says “Título + cuerpo → home HTTP”; updating that inventory line is not a close-out.

## Residual NO-GO

MP-LIVE-05, live credentials, fiscal/ARCA, BlackStore companion live, tag, deploy, publish, and `/sdd.finish` stay outside this PR. The UX WIP stays under `sdd/wip/`. Verify run `36218364090` is not CI green. This verdict is scope only.
