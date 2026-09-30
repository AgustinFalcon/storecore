VERDICT: APPROVED

# Grok 4.7 — PR #101 SCOPE lane

**Date:** 2026-09-30
**Lane:** SCOPE
**PR:** https://github.com/AgustinFalcon/storecore/pull/101
**Title:** Prove DSP-009 release and expiry emit PENDING desired-stock
**Issue:** https://github.com/AgustinFalcon/storecore/issues/100
**GitHub base:** `integration/storecore-int`
**Branch:** `feature/dsp009a-release-expiry-projection`
**SHA reviewed:** `dea4ad67a6431e76ed44c79674a4f49e52d61860`
**Reviewed diff:** `git diff origin/integration/storecore-int...HEAD` (merge-base `41966d4b2eee2e0cc8588b054ae7b1b4e284f038`). 5 files, +88 / −8.
**No merge.** This file does not approve GitHub, hosted CI, `master`, the dispatcher, or live BlackStore. It does not authorize deploy, tag, push, secrets, or `/sdd.finish`. The other prv41 lane must also be `APPROVED` before merge.

`gh pr view 101` is `OPEN`, base `integration/storecore-int`, head `dea4ad67a6431e76ed44c79674a4f49e52d61860`, one commit, and the same five paths. The body says the change is test evidence only: no production code, Flyway, dispatcher, live companion, GRANT, or `sdd.finish`. Hosted CI is left unchecked and is not treated as a pass.

## SDD why

Issue #100 is the prv39 residual on TASK-DSP-009. Dual prv39 approved the in-saga bridge (PR #97, `8da8392`, issue #96) with commit-path rows in `Dsp009BlackStoreBridgeTest`. Release and expiry already share `mutateReserved` and `projectionCause`, and the acceptance criteria still name commit, release, and expiry. This PR adds those two rows. In scope is PG16 evidence that `MARKETPLACE_ML` ACTIVE release and expiry emit one `STOCK_DESIRED_CHANGED` PENDING with `EXTERNAL_BLACKSTORE_RELEASE` / `EXTERNAL_BLACKSTORE_EXPIRY`, leave historic `LISTING_STOCK` unchanged, and do not duplicate on replay. Out of scope stays fiscal/ARCA, live BlackStore, the ML dispatcher, `INSERT(variant_id)`, and hosted CI as a pass.

## What was read

1. `gh pr view 101` and `gh issue view 100`.
2. Full `git diff origin/integration/storecore-int...HEAD` and `git diff --name-only`.
3. Installed engine, not edited by this diff: `JdbcBlackStoreSagaEngine.release`, `expireDue`, and `mutateReserved`. A second release returns when `row.state == already` before `requestProjection`. A second `expireDue` selects only `state='RESERVED'`. `projectionCause` maps `RELEASED` and `EXPIRED` to the sealed BlackStore causes.
4. This lane does not read the other prv41 file and does not copy the prv39 verdict. prv39 remains the product gate for the bridge; this review only judges the residual test slice.

## Diff judged

Test plus ledger. No `backend/src/main`, no `.sql`, no Flyway file, no frontend, no GRANT, no dispatcher type, and no new credential path.

| Path | Change |
| --- | --- |
| `backend/src/test/kotlin/com/storecore/commerce/Dsp009BlackStoreBridgeTest.kt` | Adds `releaseWithMlDelegatesPendingDesiredChangedWithoutListingStock` and `expireWithMlDelegatesPendingDesiredChangedWithoutListingStock`. Both activate `MARKETPLACE_ML`, reserve, then release or force `expires_at` and `expireDue`. Each expects state `RELEASED` or `EXPIRED`, one `STOCK_DESIRED_CHANGED` row, delivery `PENDING`, and `source_cause` from `ProjectionSourceCause.ExternalBlackStoreRelease` or `ExternalBlackStoreExpiry`. Historic `LISTING_STOCK` stays one row and the same `to_jsonb`. A second `release` or a second `expireDue` (returns 0) keeps the count at 1. `disableMarketplaceMl` is the same UPDATE the commit test already ran in `finally`. |
| `CHANGELOG.md` | TASK-DSP-009 row points at SHA stamp #98 / PR #99 (`41966d4`) and residual issue #100. It still says there is no dispatcher and no live companion. |
| `sdd/STATUS.md` | DSP paragraph records the #99 stamp and issue #100. Flyway ceiling stays V19; next free stays V20 with no file. The WIP stays open: no dispatcher, no `sdd.finish`, no live ML/BlackStore. |
| `sdd/wip/20260924-ml-desired-stock-projection/4-implementation/knowledge.md` | Intro names issue #100 and still says issues 1–13 stay closed, hosted CI `steps=[]` is not a pass, and there is no dispatcher, live ML, `INSERT(variant_id)`, or `sdd.finish`. The new row is `(PR al merge)` / `(squash al merge)` / `prv pendiente`. |
| `sdd/wip/20260924-ml-desired-stock-projection/4-implementation/progress.md` | Same residual pointer. State stays `implementable_dag_merged`. WIP stays open. |

The only commit on this branch is `dea4ad6`.

## Scope checks

| Check | Result |
| --- | --- |
| Issue #100 test evidence only | PASS. The new tests call the existing `JdbcBlackStoreSagaEngine` through the same in-saga bridge. This diff does not add a dispatcher, a companion client, or a second writer. |
| No Flyway | PASS. `git diff --name-only` has no `.sql`. STATUS still says ceiling V19 and next free V20 with no file. |
| No production Kotlin | PASS. The only Kotlin path is `backend/src/test/kotlin/com/storecore/commerce/Dsp009BlackStoreBridgeTest.kt`. |
| No dispatcher | PASS. No claim query and no delivery transition in the diff. The assertions read `PENDING`; they do not move it. |
| No live credentials | PASS. This diff adds no secret, OAuth exchange, or network client. Existing fixture strings in that test (`test-only:dsp009`, `ref:dsp009`) are unchanged. |
| No GRANT / `INSERT(variant_id)` | PASS. No `GRANT` text in the diff. |
| No CI-green or `sdd.finish` claim | PASS. The PR test plan leaves hosted CI unchecked. STATUS, progress, and knowledge keep `sdd.finish` closed and the WIP open. The knowledge row says `prv pendiente`, not dual APPROVED. |
| USER and CUSTOMER stay separate | PASS. No identity route, realm, or customer table is in the diff. |
| Issues 1–13 stay closed | PASS. Knowledge still says not to reopen them. This slice cites #96, #98, #99, and #100 only. |
| Fiscal/ARCA and live BlackStore stay NO-GO | PASS. The diff does not open those WIPs, add fiscal code, or activate a live companion. STATUS still refuses live ML/BlackStore. |

## Validations

| Check | Result |
| --- | --- |
| `git diff --stat origin/integration/storecore-int...HEAD` | 5 files, 88 insertions, 8 deletions. |
| `git diff --check origin/integration/storecore-int...HEAD` | Exit 0. |
| Maven | Not started by this lane. The PR body records a local `Dsp009BlackStoreBridgeTest` exit 0; that claim is not re-run here and is not hosted CI. |
| Hosted CI | Not treated as a pass. |

## Gaps

No scope change requested. The ledger leaves the PR SHA and the dual-review cell blank until merge, which matches an open slice.
