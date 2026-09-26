VERDICT: APPROVED

# Grok 4.7 — PR #25 scope

**Lane:** SCOPE
**PR:** https://github.com/AgustinFalcon/storecore/pull/25
**Title:** Mostrar los bloques del banner en la consola de contenido
**GitHub base:** `master` (`baseRefName=master`)
**Product commit judged:** `7572278decf007df99405f0ab1f72a485f2caa2b` (`Stop claiming the home has no banner blocks when the console payload omits them.`)
**Reviewed diff:** `git diff origin/master...7572278` (`6831a13...7572278`). Seven frontend files plus the two PR 25 review files. +229 / −11 across those nine paths.
**No merge.** This file does not approve GitHub, does not call CI green, and does not authorize `/sdd.finish`.

The scope file previously on this branch approved `332a75d`. That approval is stale. This review replaces it and judges `7572278`.

At the start of this review, `gh pr view 25` reported `headRefOid` `7572278decf007df99405f0ab1f72a485f2caa2b`, state `OPEN`. Later commits on the branch rewrite review files only. `git diff 7572278` for the Angular paths is empty. The product files judged here are the ones in `7572278`.

## What was read

1. `gh pr view 25` (title, body, base, head `7572278` at confirmation time, commits, Verify rollup).
2. Full `git diff origin/master...7572278`, and commit `7572278` itself (only `user-content.view.html`).
3. SDD why: `sdd/STATUS.md` (UX-ANG on existing routes; a checkout URL is not payment proof; MP-LIVE-05, fiscal, tag, deploy, publish, and `/sdd.finish` stay NO-GO; a Verify job that never starts is not CI green).
4. The prior scope text, which still described the empty-banner sentence as the console behavior.

## SDD why

The operator screen `/user/content` may list banner blocks only when the existing home GET body includes a `blocks` array. Publish stays title + body on the existing PUT. The public carousel, catalog, promos, favorites, and cart stay as they are. STATUS still refuses a new content API, Kotlin in this PR, invented slides, fiscal/ARCA, a payment SDK, secrets, tag, deploy, publish, and `/sdd.finish`.

## Diff judged

```text
frontend/src/app/data/mappers/http-mappers.spec.ts
frontend/src/app/data/mappers/http-mappers.ts
frontend/src/app/data/user/user-http.repository.ts
frontend/src/app/domain/user/user.entity.ts
frontend/src/app/features/admin/user-content.view.html
frontend/src/app/features/admin/user-content.view.ts
frontend/src/app/features/admin/user.store.ts
```

`7572278` changes the content template only. No Kotlin, SQL, OpenAPI, `app.routes.ts`, `package.json`, `.github`, or storefront home.

## Scope checks

| Check | Result |
| --- | --- |
| Empty sentence gone | PASS on `7572278`. `git grep` for `Este home no tiene bloques para el banner.` in `*.html` and `*.ts` has no hit. Commit `7572278` deletes that paragraph from `user-content.view.html`. |
| Block list only when `homeBlocks` is an array | PASS. `mapHomeDraft` copies `blocks` only when `Array.isArray`. Otherwise the draft has no `blocks` and `loadHome` sets `homeBlocks` to `null`. The template is `@if (state.homeBlocks)` around the banner section and its `<ul>`. `null` skips the section. An array, including an empty one, renders the list. Initial state is `null`, so the list is absent before a payload that includes an array. |
| Save stays title + body | PASS. `homeDraftSavePayload` returns `{ title, body }`. `saveHome()` puts that object. `persistHome` executes `{ title: this.snapshot.home.title, body: this.snapshot.home.body }`. `setHome` and the view `patch` keep the editable draft to those two fields. |
| No invented slides | PASS. The list renders `state.homeBlocks` from the mapped payload. There is no hardcoded slide, fixture hero, or fallback campaign. A missing `blocks` field does not synthesize rows and does not print a claim that the home has no banner blocks. |
| No Kotlin | PASS. The product paths are Angular. `HomeDraft`, `HomeRequest`, `adminHomeDraft`, and `saveHome` are untouched. |
| No new route | PASS. No router file. The screen remains the existing content view. `readHome()` is still `GET /user/content/home`. |
| USER and CUSTOMER stay separate | PASS. The lede says this screen feeds the public home and is not the buyer account. No customer cookie, session, or route is in the diff. |
| No secrets, tag, deploy, or `/sdd.finish` | PASS. No workflow, environment secret, tag, or SDD archive edit in the product commit. |

## Validations

| Check | Result |
| --- | --- |
| Diff and commit | PASS, 2026-09-26. Merge-base with `origin/master` is `6831a13`. Product behavior is commit `7572278`. |
| `npm test` in `frontend/` | PASS, 2026-09-26. `ng test --watch=false` exit 0. `Test Files  21 passed (21)`. `Tests  50 passed (50)`. Duration 8.91s. The mapper case still maps two blocks when present, omits them from `homeDraftSavePayload`, and leaves `blocks` undefined when the payload has no array. |
| GitHub Verify on `7572278`, run [36215609934](https://github.com/AgustinFalcon/storecore/actions/runs/36215609934) | **Not CI green.** `backend` (`108330864067`) and `frontend` (`108330864308`) completed `failure` in about 2 s (`2026-09-26T03:42:06Z`–`03:42:09Z`), `steps: []`. Annotation on both: the job was not started because recent account payments failed or the spending limit needs to be increased. No test suite ran on GitHub. |
| Later Verify on docs commit `afd214b`, run [36216050790](https://github.com/AgustinFalcon/storecore/actions/runs/36216050790) | **Not CI green either.** `backend` and `frontend` completed `failure` in about 3 s (`2026-09-26T03:50:44Z`–`03:50:47Z`), `steps: []`. Same billing failure. Empty steps are not a green check. |

## Standards

StoreCore presentation stays container → view → ComponentStore → use case → HTTP repository (`sdd/PATTERNS.md`). This diff keeps that split: the content view stays presentational, `UserStore` owns `homeBlocks`, and the HTTP repository is the only place that writes the PUT body. The generic Angular NgRx folder layout is not the StoreCore pattern, and this PR does not start a second state stack.

No backend or architecture file is in the product diff, so those standards have nothing new to apply. No new forbidden surface (endpoint, Kotlin, invented slide, route, SDK, fiscal, secret, tag, deploy, `/sdd.finish`).

## Gaps

Non-blocking. Today's `HomeDraft` JSON is title and body, so a live admin GET omits `blocks`, `homeBlocks` stays `null`, and the banner section stays off the page. That is the allowed ceiling; this PR does not change the API to start returning blocks. An empty `blocks` array is truthy in the template, so it renders the heading and an empty list, with no invented row and without the removed sentence. A non-object array entry becomes an empty id/title/body through `asRecord` and `text`, the same shape the public `mapHome` mapper already uses. `UserStore` has no new unit test for the null versus array split; the mapper test covers presence, absence, and the save payload.

## Residual NO-GO

MP-LIVE-05, live credentials, fiscal/ARCA, BlackStore companion live, tag, deploy, publish, and `/sdd.finish` stay outside this PR. This verdict is scope only. No merge and no GitHub approve.
