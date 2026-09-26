VERDICT: APPROVED

# Grok 4.7 — PR #25 scope

**Lane:** SCOPE
**PR:** https://github.com/AgustinFalcon/storecore/pull/25
**Title:** Mostrar los bloques del banner en la consola de contenido
**GitHub base:** `master` (`baseRefName=master`)
**Branch:** `feature/storecore-home-blocks`
**PR head judged:** `a2970dc987555076350988e09fe28372d3c991de` (`Re-read the public home after publish so the console does not keep the previous banner list.`)
**Product list commit:** `4a1760cb02461ae8e75f1d9df9a2891efc18eb22` (`Show the public home banner blocks on the operator content screen.`)
**Reviewed diff:** `git diff origin/master...HEAD` (merge-base `6831a13`). `git diff 4a1760c..a2970dc -- frontend/` is only `user.store.ts` and `user.store.spec.ts`.
**No merge.** This file does not approve GitHub, does not call CI green, and does not authorize `/sdd.finish`.

`gh pr view 25 --json headRefOid` at the start of this review was `4a1760cb02461ae8e75f1d9df9a2891efc18eb22`, state `OPEN`. Notes that say `APPROVED` for `7572278` do not cover `4a1760c`. `4a1760c` alone left «Este home no tiene bloques para el banner.» on screen after Publicar created the first hero. The current head `a2970dc` re-reads the public home after that save. This verdict is for `a2970dc`.

## What was read

1. `gh pr view 25` at the start (title, body, base `master`, state `OPEN`, head `4a1760c`) and again after `a2970dc` (same URL, state `OPEN`, head `a2970dc987555076350988e09fe28372d3c991de`).
2. Full `git diff origin/master...4a1760c`, `git show 4a1760c`, and `git show a2970dc`.
3. SDD why: `sdd/STATUS.md` (UX-ANG on the 22 existing routes, not pixel-complete, not an archive; a `checkoutUrl` is not payment proof; MP-LIVE-05, fiscal, and `/sdd.finish` stay NO-GO; a Verify job that never starts is not CI green). `screen-inventory.md` U-02 (`/user/content`, “Título + cuerpo → home HTTP”). `product-decision-home-carousels.md` (public banner slides come from `GET /api/v1/content/home`; zero slides do not paint a region; no invented copy).
4. `sdd/PATTERNS.md` frontend path: container → view → ComponentStore → use case → HTTP repository. USER and CUSTOMER stay separate.
5. `UserStore.loadHome` / `persistHome` at `a2970dc`, `user-content.view.html`, `GetHomeUseCase`, `CatalogHttpRepository.readHome` (`GET /content/home`), and `CatalogService.home()` / `saveHome()` / `adminHomeDraft()` / `HomeRequest` outside the diff.

## SDD why

`/user/content` lists the banner titles and bodies the public home is already serving. That list is the existing `GET /content/home` through `GetHomeUseCase`. Publish stays title + body on the existing `PUT /user/content/home`. The public carousel, catalog, promos, favorites, and cart stay as they are. STATUS still refuses a new content API, a payment SDK, fiscal/ARCA, secrets, tag, deploy, publish, and `/sdd.finish`. U-02 still describes title + body; the read-only list does not add a route or a save field.

This is still the operator content screen. There is no new endpoint and no invented slide.

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

`4a1760c` fills `homeBlocks` from `GetHomeUseCase` on load and prints the empty sentence only for a non-null empty array. `a2970dc` makes `persistHome` call that same use case again after a successful save. No Kotlin, SQL, OpenAPI, `app.routes.ts`, `package.json`, `.github`, or storefront/cart/promo path. `mapHome` is unchanged. `GetHomeUseCase` is already provided in `app.config.ts`.

## Scope checks

| Check | Result |
| --- | --- |
| Still the operator content screen | PASS. The route stays `/user/content`. The form is still title and body. The block section is read-only. The lede says this screen feeds the public home and is not the buyer account. |
| Banner list comes from the existing public home read | PASS. `loadHome` `forkJoin`s `SaveHomeContentUseCase.load()` with `GetHomeUseCase.execute()`. `homeBlocks` is `published.blocks` mapped to id, title, and body. After a successful save, `persistHome` calls `publicHome.execute()` again and replaces `homeBlocks` from that result. The console PUT body is not the list. |
| Empty sentence only when that public call returned `[]`, and not while loading, on error, or when `homeBlocks` is null | PASS. The template shows «Este home no tiene bloques para el banner.» only inside `@if (!state.loading && !state.errorMessage && state.homeBlocks)` when `length === 0`. `null` hides it. `loadHome` and `persistHome` set `loading: true` before the read, so the sentence is hidden in flight. A failed load sets `homeBlocks` to `null` and `errorMessage`. A failed re-read after a successful save sets `homeBlocks` to `null` and `errorMessage` and does not keep the pre-save array. A save error sets `errorMessage` and does not paint the section. Title validation sets “El título es obligatorio.” and does not touch `homeBlocks`. |
| Save stays title + body | PASS. `persistHome` executes `{ title, body }`. `homeDraftSavePayload` returns only those fields. `PUT /user/content/home` sends that object. `setHome` and the view `patch` keep the editable draft to title and body. `HomeRequest` is still title + body. The store spec asserts the save call is that object. |
| No new endpoint | PASS. Public read is the existing catalog home GET. Save is the existing operator PUT. The diff has no new controller mapping. |
| No invented slides | PASS. Rows are id, title, and body from the public blocks. The console does not synthesize a hero from the form. `saveHome()` still writes the existing `hero` section. The storefront carousel file is not in the diff. |
| No payment SDK, fiscal code, secrets, tag, deploy, or `/sdd.finish` | PASS. No `package.json`, Kotlin, SQL, workflow, or archive move. |

`CatalogService.home()` returns a `blocks` array from active `home_content_sections` rows. Zero rows is an empty public list, which is the case that shows the sentence. `saveHome()` upserts `hero` with `active=true` and returns `HomeDraft` without `blocks`. The follow-up public read is what drops the empty sentence after that insert.

## Validations

| Check | Result |
| --- | --- |
| Diff name-only and commit list | PASS, 2026-09-26. Merge-base with `origin/master` is `6831a13`. Judged head `a2970dc987555076350988e09fe28372d3c991de`. `4a1760c` is its ancestor. |
| `npm test` in `frontend/` | PASS, 2026-09-26, on this worktree at `a2970dc`. `node_modules` is present. `npm test -- --watch=false` ran `ng test --watch=false` and exited 0: 21 files, 53 tests, duration 15.47s. Local pass only. The new store test loads a public `[]`, saves title + body, and expects a second public read that replaces `homeBlocks`. |
| GitHub Verify run [36218364090](https://github.com/AgustinFalcon/storecore/actions/runs/36218364090) on `a2970dc` | **Not CI green.** `backend` `108338768396` and `frontend` `108338768577` both completed `failure` in about 2–3 s (`2026-09-26T04:37:06Z`–`04:37:09Z`), `steps: []`. Annotation on both: the job was not started because recent account payments failed or the spending limit needs to be increased. No test suite ran on GitHub. |
| GitHub Verify run [36216827777](https://github.com/AgustinFalcon/storecore/actions/runs/36216827777) on `4a1760c` | **Not CI green.** `backend` `108334331177` and `frontend` `108334331231` both completed `failure` in about 2 s (`2026-09-26T04:06:16Z`–`04:06:18Z`), `steps: []`, same billing annotation. |

## Standards

StoreCore presentation stays container → view → ComponentStore → use case → HTTP repository (`sdd/PATTERNS.md`). The content view stays presentational. `UserStore` owns `homeBlocks` and calls `GetHomeUseCase` plus `SaveHomeContentUseCase`. The public read is the catalog home use case, not a CUSTOMER session. The generic Angular NgRx folder layout is not the StoreCore pattern, and this PR does not start a second state stack.

No backend or architecture file is in the diff, so those standards have nothing new to apply. No new forbidden surface (route, SDK, fiscal, BlackStore browser client, secret, tag, deploy, `/sdd.finish`).

## Gaps

Non-blocking. `forkJoin` fails the whole load when the public read fails, so a successful console draft is not applied and the form stays on the initial blank title and body while the error is shown. The empty sentence stays hidden in that case. The storefront rotates at most five blocks (`carouselSlides` uses `slice(0, 5)`); the console lists the full public array. `mapHome` turns a missing public `blocks` field into `[]`; live `home()` always emits the array, and this PR does not change `mapHome`. A save-transport error sets `errorMessage` and leaves the previous `homeBlocks` in memory; the template still hides the section while that message is set. There is no store test for a public re-read that fails after a successful save. U-02 still says “Título + cuerpo → home HTTP”; updating that inventory line is not a close-out.

## Residual NO-GO

MP-LIVE-05, live credentials, fiscal/ARCA, BlackStore companion live, tag, deploy, publish, and `/sdd.finish` stay outside this PR. The UX WIP stays under `sdd/wip/`. Verify runs `36216827777` and `36218364090` are not CI green. This verdict is scope only.
