VERDICT: APPROVED

# Grok 4.7 — PR #25 scope

**Lane:** SCOPE
**PR:** https://github.com/AgustinFalcon/storecore/pull/25
**Title:** Mostrar los bloques del banner en la consola de contenido
**GitHub base:** `master` (`baseRefName=master`)
**Branch:** `feature/storecore-home-blocks`
**PR head when re-checked:** `644bb2a` (`Record the SDD approval of the home blocks console.`)
**Product commit:** `7572278` (`Stop claiming the home has no banner blocks when the console payload omits them.`)
**Reviewed diff:** `git diff origin/master...644bb2a` (`6831a13...644bb2a`). Product behavior is `7572278`. `git diff 7572278..644bb2a -- frontend/` is empty.
**No merge.** This file does not approve GitHub, does not call CI green, and does not authorize `/sdd.finish`.

The scope note that approved `332a75d` is stale. That commit still printed «Este home no tiene bloques para el banner.» This review judges the product at `7572278`, which is an ancestor of `644bb2a`. Commits after `7572278` through `644bb2a` only rewrite `sdd/reviews/`.

## What was read

1. `gh pr view 25` (title, body, base `master`, state `OPEN`, Verify rollup). The re-check head on this branch is `644bb2a`.
2. Full `git diff origin/master...644bb2a`, plus `git show 7572278` (template only).
3. SDD why: `sdd/STATUS.md` (UX-ANG on the 22 existing routes, not pixel-complete, not an archive; a `checkoutUrl` is not payment proof; MP-LIVE-05, fiscal, and `/sdd.finish` stay NO-GO; a Verify job that never starts is not CI green). `screen-inventory.md` U-02 (`/user/content`, “Título + cuerpo → home HTTP”). `product-decision-home-carousels.md` (public banner slides come from `GET /api/v1/content/home`; zero slides do not paint a region; no invented copy).
4. `sdd/PATTERNS.md` frontend path: container → view → ComponentStore → use case → HTTP repository. USER and CUSTOMER stay separate.
5. `UserStore.loadHome` / `persistHome`, `mapHomeDraft`, `homeDraftSavePayload`, and `user-content.view.html` at `7572278`.

`git grep` for `Este home no tiene bloques` on `644bb2a` under `*.html`, `*.ts`, and `*.kt` finds no match.

## SDD why

`/user/content` may list banner block titles and bodies only when the existing home-content GET includes a `blocks` array. Publish stays title + body on the existing PUT. The public carousel, catalog, promos, favorites, and cart stay as they are. STATUS still refuses a new content API, a payment SDK, fiscal/ARCA, secrets, tag, deploy, publish, and `/sdd.finish`. U-02 still describes title + body; the read-only list does not add a route or a save field.

## Diff judged

```text
frontend/src/app/data/mappers/http-mappers.spec.ts
frontend/src/app/data/mappers/http-mappers.ts
frontend/src/app/data/user/user-http.repository.ts
frontend/src/app/domain/user/user.entity.ts
frontend/src/app/features/admin/user-content.view.html
frontend/src/app/features/admin/user-content.view.ts
frontend/src/app/features/admin/user.store.ts
sdd/reviews/20260926-grok-pr25-scope.md
sdd/reviews/20260926-grok-pr25-sdd.md
```

`7572278` changes only `user-content.view.html`: it deletes the empty-banner sentence and wraps the list in `@if (state.homeBlocks)`. No Kotlin, SQL, OpenAPI, `app.routes.ts`, `package.json`, `.github`, or storefront/cart/promo path.

## Scope checks

| Check | Result |
| --- | --- |
| List only when the user-content payload includes a `blocks` array | PASS. `mapHomeDraft` copies `blocks` only when that field is an array. `loadHome` sets `homeBlocks` to `home.blocks ?? null`. The template renders the section only inside `@if (state.homeBlocks)`, and each row shows `title` and `body` with no inputs. |
| Omitted `blocks` render no empty-banner sentence | PASS. A missing or non-array `blocks` leaves the draft without that field, so `homeBlocks` becomes `null`. `@if` is false. The sentence is not in the template. |
| Errors render no such sentence | PASS. Load and save errors set `loading` and `errorMessage` and do not assign `homeBlocks`. They do not print that sentence. |
| Title validation renders no such sentence | PASS. An empty title sets “El título es obligatorio.” and does not touch `homeBlocks`. |
| Pre-load renders no such sentence | PASS. Initial state is `loading: false` and `homeBlocks: null`. The first paint has no banner section and no empty-banner sentence. |
| Save stays title + body | PASS. `persistHome` executes `{ title, body }`. `homeDraftSavePayload` returns only those fields. `PUT /user/content/home` sends that object. `setHome` and the view `patch` keep the editable draft to title and body. A PUT response that omits `blocks` leaves `homeBlocks` as it was. |
| No new API; public carousel, catalog, promos, favorites, and cart stay | PASS. `readHome` stays `GET /user/content/home`. `mapHome` is untouched. No storefront, cart, promo, or router file is in the diff. |
| Existing route only | PASS. The screen remains `/user/content`. The lede says this screen feeds the public home and is not the buyer account. |
| No payment SDK, fiscal code, secrets, tag, deploy, or `/sdd.finish` | PASS. No `package.json`, Kotlin, SQL, workflow, or archive move. |

An explicit `blocks: []` is still an array, so the heading and an empty `<ul>` can show. That list does not say the home has no banner blocks.

## Validations

| Check | Result |
| --- | --- |
| Diff name-only and commit list | PASS, 2026-09-26. Merge-base with `origin/master` is `6831a13`. Re-check head `644bb2a87ff85d9258e873d1ecedf92bf573ac45` is later than `7572278`. Frontend files match `7572278`. |
| `npm test` in `frontend/` | PASS, 2026-09-26. `node_modules` is present. `ng test --watch=false` exited 0: 21 files, 50 tests, duration 9.18s. Local pass only. |
| GitHub Verify run [36216363923](https://github.com/AgustinFalcon/storecore/actions/runs/36216363923) on `deaec75` | **Not CI green.** `backend` `108332998065` and `frontend` `108332998014` both completed `failure` in about 2 s (`2026-09-26T03:57:06Z`–`03:57:08Z`), `steps: []`. Annotation on both: the job was not started because recent account payments failed or the spending limit needs to be increased. No test suite ran on GitHub. |
| GitHub Verify run [36216050790](https://github.com/AgustinFalcon/storecore/actions/runs/36216050790) on `afd214b` | **Not CI green.** Same billing failure, `steps: []`, about 3 s (`03:50:44Z`–`03:50:47Z`). |
| GitHub Verify run [36215609934](https://github.com/AgustinFalcon/storecore/actions/runs/36215609934) on product commit `7572278` | **Not CI green.** Same billing failure, `steps: []`, about 2–3 s (`03:42:06Z`–`03:42:09Z`). |

## Standards

StoreCore presentation stays container → view → ComponentStore → use case → HTTP repository (`sdd/PATTERNS.md`). This diff keeps that split: the content view stays presentational, `UserStore` owns `homeBlocks`, and the HTTP repository sends the save payload. The generic Angular NgRx folder layout is not the StoreCore pattern, and this PR does not start a second state stack.

No backend or architecture file is in the diff, so those standards have nothing new to apply. No new forbidden surface (route, SDK, fiscal, BlackStore browser client, secret, tag, deploy, `/sdd.finish`).

## Gaps

Non-blocking. `UserStore` has no unit test for the `null` versus array split. The mapper spec covers a present array, an omitted field, and a save body of title + body. Today’s operator GET still returns title and body only, so the console shows no banner list and no claim that the banner is empty. U-02 still says “Título + cuerpo → home HTTP”; updating that inventory line is not a close-out.

## Residual NO-GO

MP-LIVE-05, live credentials, fiscal/ARCA, BlackStore companion live, tag, deploy, publish, and `/sdd.finish` stay outside this PR. The UX WIP stays under `sdd/wip/`. Verify runs `36215609934`, `36216050790`, and `36216363923` are not CI green. This verdict is scope only.
