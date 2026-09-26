VERDICT: APPROVED

# Grok 4.7 — PR #25 scope

**Lane:** SCOPE
**PR:** https://github.com/AgustinFalcon/storecore/pull/25
**Title:** Mostrar los bloques del banner en la consola de contenido
**GitHub base:** `master` (`baseRefName=master`)
**Branch:** `feature/storecore-home-blocks`
**SHA reviewed:** `bc915f13cdd307e3ea823c20f0b398bfa8bedb5b` (`Record a Grok scope approval of the home re-read.`)
**Fetched head:** `origin/feature/storecore-home-blocks` after `git fetch origin feature/storecore-home-blocks master`. The branch has moved past the product commit `a2970dc987555076350988e09fe28372d3c991de`. Intermediate tips during this pass were `fbee37c`, `3e17776`, and `a970957`.
**Product commit inside this head:** `a2970dc987555076350988e09fe28372d3c991de` (`Re-read the public home after publish so the console does not keep the previous banner list.`)
**Commits after that product change:** `4a11a93`, `fbee37c`, `223180d`, `f1fc43f`, `3e17776`, `a970957`, and `bc915f1` rewrite review files only. `git diff a2970dc..bc915f1 -- frontend` is empty. `bc915f1` changes only this scope note relative to `a970957`.
**State when reviewed:** `OPEN`
**Reviewed diff:** `git diff origin/master...HEAD` (merge-base `6831a135e9cb74627b995ca6f4472f757416b3f3`).
**No merge.** This file does not approve GitHub, does not call CI green, and does not authorize `/sdd.finish`.

Notes that say `CHANGES_REQUIRED` against `4a1760cb02461ae8e75f1d9df9a2891efc18eb22` are stale. `4a1760c` loaded the public list once and left that array in place after Publicar. This pass judges `bc915f1`, whose product code is `a2970dc`.

## What was read

1. `gh pr view 25 --repo AgustinFalcon/storecore --json title,body,baseRefName,headRefOid,state,commits`. At that moment GitHub head was `a2970dc` and state was `OPEN`. Later fetches moved the branch through `3e17776` and `a970957` to `bc915f1`.
2. Full `git diff origin/master...HEAD` on `bc915f1`. The product files are the same as on `a2970dc`.
3. SDD why: `sdd/STATUS.md` (UX-ANG on the 22 existing routes; MP-LIVE-05, fiscal/ARCA, and `/sdd.finish` stay NO-GO; a Verify job that never starts is not CI green). U-02 in `sdd/wip/20260923-storecore-frontend-ux-system-v1/1-functional/screen-inventory.md` (`/user/content`, “Título + cuerpo → home HTTP”). `product-decision-home-carousels.md` (banner slides come from `GET /api/v1/content/home`; zero slides do not paint a region).
4. `sdd/PATTERNS.md`: container → view → ComponentStore → use case → HTTP repository. CUSTOMER and USER do not share a session.
5. `user-content.view.html`, `UserStore.loadHome` / `persistHome`, `mapHomeDraft`, `homeDraftSavePayload`, `GetHomeUseCase` → `CatalogHttpRepository.readHome()` → `GET ${apiBaseUrl}/content/home` with `apiBaseUrl` `/api/v1`. On `master`, `JdbcCatalogService.home()` always returns a `blocks` list of active `home_content_sections` rows, and `saveHome` inserts an active `hero` when that row is missing. Neither Kotlin file is in this diff.

`git grep` for `Este home no tiene bloques` finds one line, in `user-content.view.html`.

## SDD why

`/user/content` lists the banner titles and bodies the public home is already serving, from the existing `GET /api/v1/content/home`. The form stays the console draft title and body. Publicar saves only `{ title, body }` on the existing `PUT /api/v1/user/content/home`. After a successful save the store reads the public home again, so a previous `[]` or older titles are not kept. If that re-read fails, `homeBlocks` is `null` and the empty-banner sentence stays hidden. The sentence «Este home no tiene bloques para el banner.» appears only when a present public array has length 0, and not while loading or in error. No new endpoint, no Kotlin, no invented slides, no BlackStore, no secrets.

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

No Kotlin, SQL, OpenAPI, `app.routes.ts`, `package.json`, `.github`, `.env`, or storefront/cart/promo path. `mapHome` is untouched. `GetHomeUseCase` is already provided in `app.config.ts`.

## Scope checks

| Check | Result |
| --- | --- |
| Console lists public home banner blocks from `GET /api/v1/content/home` | PASS. `loadHome` sets `homeBlocks` from `GetHomeUseCase.execute()`, which calls `readHome()` on `/api/v1/content/home`. The view lists `block.title` and `block.body` from that array. It does not invent slides. |
| Form stays the console draft title + body | PASS. `loadHome` copies only `draft.title` and `draft.body` into `home`. `setHome` and the view `patch` keep the editable draft to those two fields. |
| Publicar saves only `{ title, body }` | PASS. `persistHome` executes `{ title, body }`. `homeDraftSavePayload` returns only those fields. `PUT /user/content/home` sends that object. |
| After a successful save the store re-reads the public home | PASS. `persistHome` calls `publicHome.execute()` again and replaces `homeBlocks` with that `published.blocks`. The store spec starts from a public `[]`, saves `{ title, body }` with no `blocks`, and expects the second public read’s hero row. `loading` is true for the whole save-and-reread, so the pre-save list is not painted in between. |
| Failed re-read hides the empty-banner sentence | PASS. The re-read `catchError` sets `homeBlocks` to `null`, `loading` to false, and `errorMessage`. The section requires `state.homeBlocks`, so `null` hides the sentence. The form keeps the saved title and body. |
| Sentence only for a present array of length 0, not while loading or in error | PASS. The section is `@if (!state.loading && !state.errorMessage && state.homeBlocks)`. The sentence is the inner `@if (state.homeBlocks.length === 0)`. An empty array is truthy, so that case prints it. `null` does not. Initial state is `homeBlocks: null`. A load or save sets `loading: true` first. |
| No new endpoint, no Kotlin, no BlackStore, no secrets | PASS. The extra read is the existing public home GET, including the post-save re-read. The diff has no `.kt` file, no BlackStore path, and no secret. |
| Public carousel, catalog, promos, favorites, and cart stay | PASS. No storefront, cart, promo, or router file is in the diff. The storefront still rotates `blocks.slice(0, 5)`. |
| Existing route only | PASS. The screen remains `/user/content`. The lede says this screen feeds the public home and is not the buyer account. |

`CatalogService.home()` always returns a `blocks` list. Zero active rows is a present empty array, which is the case that shows the sentence. `saveHome` inserts an active `hero` when that row is missing. The post-save public read is what replaces the pre-save `[]`.

## Validations

| Check | Result |
| --- | --- |
| Diff name-only and commit list | PASS, 2026-09-26. Merge-base with `origin/master` is `6831a13`. Product files match `a2970dc`. Head reviewed is `bc915f1`. |
| Focused frontend test | PASS, 2026-09-26. `node_modules` was absent in the review worktree, so it was a junction to `C:\Users\agustin\Desktop\StoreCore-home-blocks-fix\frontend\node_modules`. The junction is not committed. Command, from `frontend/`: `npx ng test --watch=false --include=src/app/features/admin/user.store.spec.ts`. Exit 0. Vitest 4.1.11: 1 file passed, 7 tests passed, duration 3.00s. The worktree was at `fbee37c` during the run; `git diff a2970dc..bc915f1 -- frontend` is empty, so the same product code is in the SHA reviewed. Local pass only. This is not CI green. |
| GitHub Verify run [36219002658](https://github.com/AgustinFalcon/storecore/actions/runs/36219002658) on `a970957` | **Not CI green.** `backend` `108340571785` and `frontend` `108340571934` both completed `failure` in about 2 s (`2026-09-26T04:50:09Z`–`04:50:11Z`), `steps: []`. No test suite ran on GitHub. `bc915f1` only rewrites this review file, so it does not change that result. |

## Standards

StoreCore presentation stays container → view → ComponentStore → use case → HTTP repository (`sdd/PATTERNS.md`). The content view stays presentational. `UserStore` owns `homeBlocks` and calls `GetHomeUseCase` plus `SaveHomeContentUseCase`. The public read is the catalog home use case, not a CUSTOMER session. This PR does not start a second state stack.

No backend or architecture file is in the diff, so those standards have nothing new to apply. No new forbidden surface (route, SDK, fiscal, BlackStore browser client, secret, tag, deploy, `/sdd.finish`).

## Gaps

Non-blocking. There is no store test for a failed post-save re-read; that path sets `homeBlocks` to `null`. `forkJoin` on load still drops a successful console draft when the public read fails, and the sentence stays hidden. A failed save sets `errorMessage` and does not clear `homeBlocks`; the template still hides the section while that error is set. Unchanged `mapHome` turns a missing public `blocks` key into `[]`; live `home()` always emits the array. The storefront rotates at most five blocks; the console lists the full public array. `saveHome` conflict update does not set `active`, so an already inactive hero can still read back `[]`, and the sentence then matches that public read. U-02 still says “Título + cuerpo → home HTTP”; updating that inventory line is not a close-out.

## Residual NO-GO

MP-LIVE-05, live credentials, fiscal/ARCA, BlackStore companion live, tag, deploy, publish, and `/sdd.finish` stay outside this PR. The UX WIP stays under `sdd/wip/`. Verify run `36219002658` is not CI green. This verdict is scope only.
