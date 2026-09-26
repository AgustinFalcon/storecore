VERDICT: APPROVED

# Grok 4.7 — PR #25 scope

**Lane:** SCOPE
**PR:** https://github.com/AgustinFalcon/storecore/pull/25
**Title:** Mostrar los bloques del banner en la consola de contenido
**GitHub base:** `master` (`baseRefName=master`)
**Branch:** `feature/storecore-home-blocks` @ `332a75d` (`Show home banner blocks on the operator content screen.`)
**Reviewed diff:** `git diff origin/master...332a75d` (`6831a13...332a75d`), one commit, 7 frontend files, +83 / −11
**No merge.** This file does not approve GitHub, does not call CI green, and does not authorize `/sdd.finish`.

## What was read

1. `gh pr view 25` (title, body, base, head `332a75d`, the single commit, the seven files, Verify rollup).
2. Full `git diff origin/master...332a75d`.
3. SDD why: `sdd/STATUS.md` (UX-ANG on existing routes; checkout URL is not payment proof; MP-LIVE-05, fiscal, tag, deploy, publish, and `/sdd.finish` stay NO-GO; a Verify job that never starts is not CI green). `sdd/wip/20260923-storecore-frontend-ux-system-v1/1-functional/product-decision-home-carousels.md` (public banner slides come from home blocks the API returns; zero slides do not paint a region; no invented copy, fixtures, or `store_id`).
4. Existing contract, unchanged by this diff: `GET/PUT /api/v1/user/content/home` in `CatalogController`. `HomeDraft` and `HomeRequest` are title + body. `adminHomeDraft()` and `saveHome()` do not return or accept `blocks`. Public `GET /api/v1/content/home` is a different method (`home()`) and is not called from `/user/content`.

## SDD why

The operator screen `/user/content` may list banner blocks only when the existing home GET body includes them. Publish stays title + body on the existing PUT. The public carousel, catalog, promos, favorites, and cart stay as they are. STATUS still refuses a new content API, Kotlin in this PR, invented slides, fiscal/ARCA, a payment SDK, secrets, tag, deploy, publish, and `/sdd.finish`.

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

Commit `332a75d` only. No Kotlin, SQL, OpenAPI, `app.routes.ts`, `package.json`, `.github`, storefront home, or `sdd/` path other than this review.

## Scope checks

| Check | Result |
| --- | --- |
| Blocks on `/user/content` only when the existing GET returns them | PASS. `readHome()` is still `GET /user/content/home`. `mapHomeDraft` copies `blocks` only when that field is an array. Otherwise `blocks` stays undefined and the store sets `homeBlocks` to null. The view then says the home has no banner blocks. It does not call `GET /content/home` and does not add an endpoint. |
| PUT stays title + body | PASS. `homeDraftSavePayload` returns `{ title, body }`. `saveHome()` puts that object. `setHome`, the title/body `patch`, and `persistHome` also keep the draft to those two fields. |
| No invented slides | PASS. The list renders `state.homeBlocks` from the mapped payload. There is no hardcoded slide, fixture hero, or fallback campaign. A missing `blocks` field does not synthesize rows. |
| No Kotlin | PASS. The seven paths are Angular. `HomeDraft`, `HomeRequest`, `adminHomeDraft`, and `saveHome` are untouched. |
| No new route | PASS. No router file. The screen remains the existing content view. |
| USER and CUSTOMER stay separate | PASS. The lede now says this screen feeds the public home and is not the buyer account. No customer cookie, session, or route is in the diff. |
| No secrets, tag, deploy, or `/sdd.finish` | PASS. No workflow, environment secret, tag, or SDD archive edit in the product commit. |

## Validations

| Check | Result |
| --- | --- |
| Diff name-only and commit list | PASS, 2026-09-26. Seven frontend files, one commit `332a75d`. Merge-base with `origin/master` is `6831a13`. `gh pr view 25` reports the same seven paths, +83 / −11, head `332a75d`. |
| `npm test` in `frontend/` | PASS, 2026-09-26. `ng test --watch=false`: 21 files, 50 tests. The new case maps two blocks when present, omits them from `homeDraftSavePayload`, and leaves `blocks` undefined when the payload has no array. |
| GitHub Verify run [36214172505](https://github.com/AgustinFalcon/storecore/actions/runs/36214172505) on `332a75d` | **Not CI green.** `backend` and `frontend` both completed `failure` in about 2 s (`2026-09-26T03:14:11Z`–`03:14:13Z`), `steps: []`. Annotation on both: the job was not started because recent account payments failed or the spending limit needs to be increased. No test suite ran on GitHub. |

## Standards

StoreCore presentation stays container → view → ComponentStore → use case → HTTP repository (`sdd/PATTERNS.md`). This diff keeps that split: the content view stays presentational, `UserStore` owns `homeBlocks`, and the HTTP repository is the only place that writes the PUT body. The generic Angular NgRx folder layout is not the StoreCore pattern, and this PR does not start a second state stack.

No backend or architecture file is in the diff, so those standards have nothing new to apply. No new forbidden surface (endpoint, Kotlin, invented slide, route, SDK, fiscal, secret, tag, deploy, `/sdd.finish`).

## Gaps

Non-blocking. Today's `HomeDraft` JSON is title and body, so a live admin GET omits `blocks` and the console shows the empty sentence. That is the allowed ceiling; this PR does not change the API to start returning blocks. An empty `blocks` array is truthy in the template, so it renders an empty list instead of that sentence, still with no invented row. A non-object array entry becomes an empty id/title/body through `asRecord` and `text`, the same shape the public `mapHome` mapper already uses. `HomeBannerBlock` matches the existing `HomeBlock` fields. `UserStore` has no new unit test for the null versus array split; the mapper test covers presence, absence, and the save payload.

## Residual NO-GO

MP-LIVE-05, live credentials, fiscal/ARCA, BlackStore companion live, tag, deploy, publish, and `/sdd.finish` stay outside this PR. This verdict is scope only. No merge and no GitHub approve.
