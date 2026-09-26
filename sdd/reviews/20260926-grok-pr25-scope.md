VERDICT: APPROVED

# Grok 4.7 — PR #25 scope

**Lane:** SCOPE
**PR:** https://github.com/AgustinFalcon/storecore/pull/25
**Title:** Mostrar los bloques del banner en la consola de contenido
**GitHub base:** `master` (`baseRefName=master`)
**Branch:** `feature/storecore-home-blocks`
**PR head reviewed:** `4a1760cb02461ae8e75f1d9df9a2891efc18eb22` (`Show the public home banner blocks on the operator content screen.`)
**State when reviewed:** `OPEN`
**Reviewed diff:** `git diff origin/master...HEAD` (`6831a13...4a1760c`)
**No merge.** This file does not approve GitHub, does not call CI green, and does not authorize `/sdd.finish`.

Prior scope and SDD notes on this branch approved `7572278`. That product commit is an ancestor. `git diff 7572278..4a1760c -- frontend/` is the unreviewed product delta: the banner list now comes from `GetHomeUseCase`, and the empty-banner sentence is back only for an empty public list.

## What was read

1. `gh pr view 25` (title, body, base `master`, state `OPEN`, head `4a1760c`).
2. Full `git diff origin/master...HEAD`, plus `git diff 7572278..4a1760c` for the unreviewed slice.
3. SDD why: `sdd/STATUS.md` (UX-ANG on the 22 existing routes, not pixel-complete, not an archive; a `checkoutUrl` is not payment proof; MP-LIVE-05, fiscal, and `/sdd.finish` stay NO-GO; a Verify job that never starts is not CI green). `screen-inventory.md` U-02 (`/user/content`, “Título + cuerpo → home HTTP”). `product-decision-home-carousels.md` (public banner slides come from `GET /api/v1/content/home`; zero slides do not paint a region; no invented copy).
4. `sdd/PATTERNS.md` frontend path: container → view → ComponentStore → use case → HTTP repository. USER and CUSTOMER stay separate.
5. `UserStore.loadHome` / `persistHome`, `user-content.view.html`, `GetHomeUseCase`, `CatalogHttpRepository.readHome`, and `CatalogService.home()` / `saveHome()`.

## SDD why

`/user/content` lists the banner titles and bodies that the public home is already serving. That list is `GET /content/home` through the existing `GetHomeUseCase`. Publish stays title + body on `PUT /user/content/home`. The public carousel, catalog, promos, favorites, and cart are not edited. STATUS still refuses a new content API, a payment SDK, fiscal/ARCA, secrets, tag, deploy, publish, and `/sdd.finish`. U-02 still describes title + body; the read-only list does not add a route or a save field.

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

`4a1760c` changes `user.store.ts`, `user.store.spec.ts`, and `user-content.view.html`. No Kotlin, SQL, OpenAPI, `app.routes.ts`, `package.json`, `.github`, or storefront/cart/promo path. `GetHomeUseCase` is already provided in `app.config.ts`. `mapHome` is untouched.

## Scope checks

| Check | Result |
| --- | --- |
| Banner list comes from the public home read | PASS. `loadHome` `forkJoin`s `SaveHomeContentUseCase.load()` with `GetHomeUseCase.execute()`. The form draft is `{ title, body }` from the console payload. `homeBlocks` is `published.blocks` mapped to id, title, and body. `GetHomeUseCase` calls `GET /content/home`, the same read the storefront carousel uses. A console payload that omits `blocks` still shows that public list. |
| Empty sentence only when that public list is empty | PASS. The section renders only inside `@if (!state.loading && !state.errorMessage && state.homeBlocks)`. The sentence «Este home no tiene bloques para el banner.» renders only when `state.homeBlocks.length === 0`. An empty array is truthy, so a successful public read of zero blocks shows the sentence. `null` does not. |
| Loading does not show that sentence | PASS. `loadHome` sets `loading: true` before the join. The section requires `!state.loading`, including a reload that still holds a previous list. Initial state is `homeBlocks: null`, so the first paint has no sentence. |
| Error does not show that sentence | PASS. A failed join sets `homeBlocks: null` and `errorMessage`, and does not apply the draft. The store spec asserts `homeBlocks` is `null` and `errorMessage` is non-empty when `GetHomeUseCase` fails. Save errors set `errorMessage` and do not clear a previous list, but the template still hides the section while `errorMessage` is set. Title validation sets “El título es obligatorio.” and does not touch `homeBlocks`; the same `errorMessage` gate hides the sentence. |
| Save stays title + body | PASS. `persistHome` executes `{ title, body }`. `homeDraftSavePayload` returns only those fields. `PUT /user/content/home` sends that object. `setHome` and the view `patch` keep the editable draft to title and body. A PUT response that omits `blocks` leaves `homeBlocks` as the public list from the last successful load. |
| No new API; public carousel, catalog, promos, favorites, and cart stay | PASS. No storefront, cart, promo, or router file is in the diff. `CatalogService.home()` and `saveHome()` are unchanged. `saveHome()` still writes the `hero` section only. |
| Existing route only | PASS. The screen remains `/user/content`. The lede says this screen feeds the public home and is not the buyer account. The block section says publish still sends only title and body. |
| No payment SDK, fiscal code, secrets, tag, deploy, or `/sdd.finish` | PASS. No `package.json`, Kotlin, SQL, workflow, or archive move. |

`CatalogService.home()` always returns a `blocks` array built from active `home_content_sections` rows. Zero rows is an empty public list, which is the case that shows the sentence. That matches the product rule that zero slides do not paint a banner region.

## Validations

| Check | Result |
| --- | --- |
| Diff name-only and commit list | PASS, 2026-09-26. Merge-base with `origin/master` is `6831a13`. Head `4a1760cb02461ae8e75f1d9df9a2891efc18eb22` is later than `7572278`. |
| `npm test` in `frontend/` | PASS, 2026-09-26. `ng test --watch=false` exited 0: 21 files, 52 tests, duration 25.55s. Local pass only. The two new store tests cover a console payload that omits `blocks` and a failed public read. |
| GitHub Verify run [36216827777](https://github.com/AgustinFalcon/storecore/actions/runs/36216827777) on `4a1760c` | **Not CI green.** `backend` `108334331177` and `frontend` `108334331231` both completed `failure` in about 2 s (`2026-09-26T04:06:16Z`–`04:06:18Z`), `steps: []`. Annotation on `backend`: the job was not started because recent account payments failed or the spending limit needs to be increased. No test suite ran on GitHub. |

## Standards

StoreCore presentation stays container → view → ComponentStore → use case → HTTP repository (`sdd/PATTERNS.md`). The content view stays presentational. `UserStore` owns `homeBlocks` and calls `GetHomeUseCase` plus `SaveHomeContentUseCase`. The public read is the catalog home use case, not a CUSTOMER session. The generic Angular NgRx folder layout is not the StoreCore pattern, and this PR does not start a second state stack.

No backend or architecture file is in the diff, so those standards have nothing new to apply. No new forbidden surface (route, SDK, fiscal, BlackStore browser client, secret, tag, deploy, `/sdd.finish`).

## Gaps

Non-blocking. `forkJoin` fails the whole load when the public read fails, so a successful console draft is not applied and the form stays on the initial blank title and body while the error is shown. The empty sentence stays hidden in that case. After a successful publish, the banner list is not read again; the PUT response omits `blocks`, so the hero row can lag the form until the next load. `mapHome` turns a missing public `blocks` field into `[]`; live `home()` always emits the array. U-02 still says “Título + cuerpo → home HTTP”; updating that inventory line is not a close-out.

## Residual NO-GO

MP-LIVE-05, live credentials, fiscal/ARCA, BlackStore companion live, tag, deploy, publish, and `/sdd.finish` stay outside this PR. The UX WIP stays under `sdd/wip/`. Verify run `36216827777` is not CI green. This verdict is scope only.
