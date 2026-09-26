VERDICT: APPROVED

# Grok 4.7 — PR #25 scope

**Lane:** SCOPE
**PR:** https://github.com/AgustinFalcon/storecore/pull/25
**Title:** Mostrar los bloques del banner en la consola de contenido
**GitHub base:** `master` (`baseRefName=master`)
**Branch:** `feature/storecore-home-blocks` @ `afd214b` (`Record SDD approval of the home blocks console.`)
**Product fix:** `7572278` (`Stop claiming the home has no banner blocks when the console payload omits them.`), ancestor of HEAD
**Reviewed diff:** `git diff origin/master...HEAD` (`6831a13...afd214b`), five commits, 7 frontend files plus the two PR 25 review files, +227 / −11
**No merge.** This file does not approve GitHub, does not call CI green, and does not authorize `/sdd.finish`.

## What was read

1. `gh pr view 25` (title, body, base `master`, head `afd214b`, state OPEN).
2. Full `git diff origin/master...HEAD`, then `7572278` itself (only `user-content.view.html`).
3. SDD why: `sdd/STATUS.md` and `AGENTS.md` (UX-ANG on existing routes; USER and CUSTOMER stay separate; MP-LIVE-05, fiscal/ARCA, tag, deploy, publish, and `/sdd.finish` stay NO-GO; a Verify job that never starts is not CI green). `sdd/PATTERNS.md` (container → view → ComponentStore → use case → HTTP repository). Sol `sdd/reviews/20260923-sol-remaining-gates.md` UX-ANG limits. The prior SDD review on this branch, now `APPROVED` at `afd214b`, which required the false empty-banner sentence to go away.
4. Existing contract, unchanged by this diff: operator content stays `GET/PUT /user/content/home`. Public `mapHome` is untouched. No new route file and no Kotlin file.

## SDD why

The operator screen `/user/content` lists banner block title and body only when the user-content payload includes a `blocks` array. When `blocks` is omitted, on error, or before load, the console does not print “Este home no tiene bloques para el banner.” Publish stays title + body on the existing PUT. The public carousel, catalog, promos, favorites, and cart stay as they are.

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

| Check | Result |
| --- | --- |
| List only when `blocks` is an array | PASS. `mapHomeDraft` copies `blocks` only when that field is an array. `loadHome` sets `homeBlocks` to `home.blocks ?? null`. The template renders the section only under `@if (state.homeBlocks)`. |
| Omitted `blocks` | PASS. The draft has no `blocks`, `homeBlocks` becomes `null`, and the section is absent. `git grep` for `Este home no tiene bloques` on HEAD finds no product file. |
| Error and “El título es obligatorio.” | PASS. Load and save errors set `loading` and `errorMessage` and do not assign `homeBlocks`. Title validation does the same. The empty-banner sentence is not in the template. |
| Before load | PASS. Initial `homeBlocks` is `null` and `loading` is `false`. The first paint has no banner section and no empty-banner sentence. |
| Save stays title + body | PASS. `homeDraftSavePayload` returns `{ title, body }`. `PUT /user/content/home` sends that object. `persistHome`, `setHome`, and the view `patch` keep the editable draft to those two fields. |
| No new API, no public carousel change | PASS. `readHome()` stays `GET /user/content/home`. `mapHome` is untouched. No new path, client, or storefront/cart/promo change. |
| No invented slides | PASS. Rows come from the mapped array. A missing `blocks` field does not synthesize a sentence or a row. |
| No Kotlin, no new route | PASS. The seven product paths are Angular. The screen remains the existing content view. |
| USER and CUSTOMER stay separate | PASS. The lede says this screen feeds the public home and is not the buyer account. No customer cookie, session, or route is in the diff. |
| No secrets, tag, deploy, or `/sdd.finish` | PASS. No workflow, environment secret, tag, or SDD archive edit. |

## Validations

| Check | Result |
| --- | --- |
| Diff name-only and commit list | PASS, 2026-09-26. Merge-base with `origin/master` is `6831a13`. HEAD `afd214b` contains product fix `7572278`. |
| `npm test` in `frontend/` | PASS, 2026-09-26. `node_modules` is a junction. `ng test --watch=false`: 21 files, 50 tests, all passed. The mapper case maps two blocks when present, omits them from `homeDraftSavePayload`, and leaves `blocks` undefined when the payload has no array. |
| GitHub Verify run [36216050790](https://github.com/AgustinFalcon/storecore/actions/runs/36216050790) on `afd214b` | **Not CI green.** `backend` `108332110573` and `frontend` `108332110438` both completed `failure` in about 3 s (`2026-09-26T03:50:44Z`–`03:50:47Z`), `steps: []`. Annotation on both: the job was not started because recent account payments failed or the spending limit needs to be increased. No test suite ran on GitHub. |

## Standards

StoreCore presentation stays container → view → ComponentStore → use case → HTTP repository (`sdd/PATTERNS.md`). This diff keeps that split: the content view stays presentational, `UserStore` owns `homeBlocks`, and the HTTP repository is the only place that writes the PUT body. The generic Angular NgRx folder layout is not the StoreCore pattern, and this PR does not start a second state stack.

No backend or architecture file is in the diff, so those standards have nothing new to apply. No new forbidden surface (endpoint, Kotlin, invented slide, route, SDK, fiscal, secret, tag, deploy, `/sdd.finish`).

## Gaps

Non-blocking. A live admin GET that still returns only title and body shows no banner list and no claim that the banner is empty. An explicit `blocks: []` is still an array, so the heading and an empty list can show; that list does not say the home has no banner blocks. A non-object array entry becomes an empty id/title/body through `asRecord` and `text`, the same shape the public `mapHome` mapper already uses. A PUT response that omits `blocks` leaves `homeBlocks` as it was. `UserStore` has no new unit test for the null versus array split; the mapper test covers presence, absence, and the save payload.

## Residual NO-GO

MP-LIVE-05, live credentials, fiscal/ARCA, BlackStore companion live, tag, deploy, publish, and `/sdd.finish` stay outside this PR. This verdict is scope only. No merge and no GitHub approve.
