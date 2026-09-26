VERDICT: APPROVED

# Grok 4.7 — PR #25 scope

**Lane:** SCOPE
**PR:** https://github.com/AgustinFalcon/storecore/pull/25
**Title:** Mostrar los bloques del banner en la consola de contenido
**GitHub base:** `master` (`baseRefName=master`)
**Branch:** `feature/storecore-home-blocks`
**Product tip:** `a2970dc987555076350988e09fe28372d3c991de` (`Re-read the public home after publish so the console does not keep the previous banner list.`)
**Branch tip when judged:** `a9709579a0437fa10ddecc9e9cf1ed94eb34fa02` (`Record the SDD approval of the home blocks public re-read.`)
**Reviewed diff:** `git diff origin/master...a970957` (merge-base `6831a135e9cb74627b995ca6f4472f757416b3f3`).
**No merge.** This file does not approve GitHub, does not call CI green, and does not authorize `/sdd.finish`.

Older CHANGES_REQUIRED notes on this branch judge `4a1760cb02461ae8e75f1d9df9a2891efc18eb22`. That commit is an ancestor. `git show a2970dc` changes only `user.store.ts` and `user.store.spec.ts`. Those notes do not cover this product commit. An APPROVED line already present on `a970957` does not replace this re-review.

Commits after `a2970dc` on this tip are review notes only: `4a11a93`, `fbee37c`, `223180d`, `f1fc43f`, `3e17776`, `a970957`. `git diff a2970dc a970957 -- frontend backend` is empty. The product behavior judged is `a2970dc`.

## What was read

1. `gh pr view 25` (title, body, base `master`, state `OPEN`, head `a2970dc` at the start of this review, later `3e17776`, then `a970957`, Verify rollup).
2. Full `git diff origin/master...HEAD` for the product commit, plus `git show a2970dc`, plus the name-only diff from `a2970dc` to `a970957`.
3. SDD why: `sdd/STATUS.md` (UX-ANG on the 22 existing routes, not pixel-complete, not an archive; a `checkoutUrl` is not payment proof; MP-LIVE-05, fiscal, and `/sdd.finish` stay NO-GO; a Verify job that never starts is not CI green). `screen-inventory.md` U-02 (`/user/content`, “Título + cuerpo → home HTTP”). `product-decision-home-carousels.md` (public banner slides come from `GET /api/v1/content/home`; zero slides do not paint a region; no invented copy).
4. `sdd/PATTERNS.md` frontend path: container → view → ComponentStore → use case → HTTP repository. USER and CUSTOMER stay separate.
5. `UserStore.loadHome` / `persistHome`, `mapHomeDraft`, `homeDraftSavePayload`, `user-content.view.html`, `GetHomeUseCase` → `CatalogHttpRepository.readHome()`, and the existing `CatalogService.home()` / `saveHome` / `adminHomeDraft()` / `HomeRequest` contracts outside the diff.

## SDD why

`/user/content` may list the banner titles and bodies the public home is already serving. That list is the existing `GET /content/home` through `GetHomeUseCase`. Publish stays title + body on the existing `PUT /user/content/home`. After a successful save the console re-reads that public home and replaces `homeBlocks`. A failed re-read clears `homeBlocks` and sets the error, so the empty-banner sentence stays hidden. The public carousel, catalog, promos, favorites, and cart stay as they are. STATUS still refuses a new content API, a payment SDK, fiscal/ARCA, secrets, tag, deploy, publish, and `/sdd.finish`. U-02 still describes title + body; the read-only list does not add a route or a save field.

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

`a2970dc` itself is only the store and its spec. No Kotlin, SQL, OpenAPI, `app.routes.ts`, `package.json`, `.github`, or storefront/cart/promo path. `mapHome` is unchanged. `GetHomeUseCase` is already provided in `app.config.ts` and still calls `GET /content/home`.

## Scope checks

| Check | Result |
| --- | --- |
| Operator may show blocks the public home already returns | PASS. `loadHome` `forkJoin`s `SaveHomeContentUseCase.load()` with `GetHomeUseCase.execute()`. The form draft is `{ title, body }` from the console payload. `homeBlocks` is `published.blocks` mapped to id, title, and body. A console payload that omits `blocks` still shows that public list. |
| After a successful save, the public home is read again and replaces `homeBlocks` | PASS. `persistHome` executes `{ title, body }`, then `publicHome.execute()`. The next handler sets `homeBlocks` from `published.blocks` and clears `errorMessage`. `loading` stays true until that read returns, and the banner section is inside `@if (!state.loading && !state.errorMessage && state.homeBlocks)`, so the pre-save empty sentence is not left on screen. `CatalogService.saveHome` inserts the missing `hero` row with `active=true`; `home()` returns active sections. The re-read is the list the carousel uses. |
| A failed re-read hides the empty-banner sentence | PASS. The inner `catchError` sets `homeBlocks` to `null`, `loading` to false, and `errorMessage` from the error, then returns `EMPTY`. `null` and a non-empty error both fail the section `@if`, so «Este home no tiene bloques para el banner.» stays hidden. The saved title and body are kept from the PUT result. |
| Empty sentence only for a real public empty list | PASS. The sentence renders only when loading and error are clear and `homeBlocks` is a present array of length 0. That is the public `[]` from `GET /content/home`, not an omitted console payload and not a failed read. |
| PUT stays title + body | PASS. `persistHome` executes `{ title, body }`. `homeDraftSavePayload` returns only those fields. `PUT /user/content/home` sends that object. `setHome` and the view `patch` keep the editable draft to title and body. `HomeRequest` is still `title` + `body`. |
| No invented slides | PASS. Rows are id, title, and body from the public blocks. The console does not synthesize a hero from the form. |
| No new endpoint and no Kotlin | PASS. Public read is the existing catalog home GET. Save is the existing operator PUT. The diff has no `.kt` file. |
| Existing route only | PASS. The screen remains `/user/content`. |
| No payment SDK, fiscal code, secrets, tag, deploy, or `/sdd.finish` | PASS. No `package.json`, Kotlin, SQL, workflow, or archive move. |

## Validations

| Check | Result |
| --- | --- |
| Diff name-only and commit list | PASS, 2026-09-26. Merge-base with `origin/master` is `6831a135e9cb74627b995ca6f4472f757416b3f3`. Product commit `a2970dc987555076350988e09fe28372d3c991de`. Branch tip `a9709579a0437fa10ddecc9e9cf1ed94eb34fa02` adds no product files. Worktree `C:\Users\agustin\Desktop\StoreCore-home-reread` was detached at the product commit, then detached again at the branch tip. Dirty worktrees were not touched. |
| UserStore spec | PASS, 2026-09-26. `frontend/node_modules` is present. `npx ng test --watch=false --include=src/app/features/admin/user.store.spec.ts` from `frontend/` exited 0. Vitest 4.1.11: 1 file, 7 tests, duration 15.50s. Local pass only. The new case loads a public `[]`, saves `{ title, body }`, asserts a second `GetHomeUseCase.execute()`, and expects the replacement block. |
| GitHub Verify run [36218364090](https://github.com/AgustinFalcon/storecore/actions/runs/36218364090) on `a2970dc` | **Not CI green.** `backend` `108338768396` (`2026-09-26T04:37:06Z`–`04:37:09Z`) and `frontend` `108338768577` (`2026-09-26T04:37:06Z`–`04:37:08Z`) both completed `failure` in about 2–3 s, `steps: []`. Annotation on both: the job was not started because recent account payments failed or the spending limit needs to be increased. No test suite ran on GitHub. |
| GitHub Verify run [36218935017](https://github.com/AgustinFalcon/storecore/actions/runs/36218935017) on `3e17776` | **Not CI green.** `backend` `108340383730` (`2026-09-26T04:48:47Z`–`04:48:50Z`) and `frontend` `108340383568` (`2026-09-26T04:48:47Z`–`04:48:49Z`) both completed `failure` in about 2–3 s, `steps: []`. Same billing annotation. No test suite ran on GitHub. |

## Standards

StoreCore presentation stays container → view → ComponentStore → use case → HTTP repository (`sdd/PATTERNS.md`). The content view stays presentational. `UserStore` owns `homeBlocks` and calls `GetHomeUseCase` plus `SaveHomeContentUseCase`. The public read is the catalog home use case, not a CUSTOMER session. The generic Angular NgRx folder layout is not the StoreCore pattern, and this PR does not start a second state stack.

No backend or architecture file is in the diff, so those standards have nothing new to apply. No new forbidden surface (route, SDK, fiscal, BlackStore browser client, secret, tag, deploy, `/sdd.finish`).

## Gaps

None that block this scope.

Non-blocking. The failed re-read is implemented in `persistHome` and is not a separate spec; the failure spec covers `loadHome` only. `forkJoin` still fails the whole load when the public read fails, so a successful console draft is not applied and the form stays on the initial blank title and body while the error is shown. A failed PUT sets `errorMessage` and leaves the previous `homeBlocks` in memory; the section stays hidden because of the error. The storefront rotates at most five blocks; the console lists the full public array. `saveHome` on conflict updates content and does not set `active=true`; the first insert still creates an active `hero`, which is the empty-home publish this re-read covers. U-02 still says “Título + cuerpo → home HTTP”; updating that inventory line is not a close-out.

## Residual NO-GO

MP-LIVE-05, live credentials, fiscal/ARCA, BlackStore companion live, tag, deploy, publish, and `/sdd.finish` stay outside this PR. The UX WIP stays under `sdd/wip/`. Verify runs `36218364090` and `36218935017` are not CI green. This verdict is scope only.
