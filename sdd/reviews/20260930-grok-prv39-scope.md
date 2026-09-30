VERDICT: APPROVED

# Grok 4.7 — PR #97 SCOPE lane

**Date:** 2026-09-30
**Lane:** SCOPE
**PR:** https://github.com/AgustinFalcon/storecore/pull/97
**Title:** TASK-DSP-009: project BlackStore commit inside the saga transaction
**Issue:** https://github.com/AgustinFalcon/storecore/issues/96
**GitHub base:** `integration/storecore-int`
**Branch:** `feature/dsp009-blackstore-projection-bridge`
**SHA reviewed:** `829c17b4e6a6140de95e4cf58effd8ca6a54fa7a`
**Reviewed diff:** `git diff origin/integration/storecore-int` (merge-base `2338fda1fb3fe3ee3212b893715f953fb0c41647`). 24 files, +406 / −40.
**No merge.** This file does not approve GitHub, hosted CI, `master`, the dispatcher, or live BlackStore. It does not authorize deploy, tag, push, secrets, or `/sdd.finish`.

## SDD why

Issue #96 is BR-DSP-08 step 3: after the sealed PIC-009 writer and the canonical projector exist, the application bridge may request a local `STOCK_DESIRED_CHANGED` cause inside the BlackStore saga transaction. PIC-005 commit/release is already merged. The PR body matches that slice: delegation is inside the saga transaction, `ChannelProjectionLockOrder.lockVariants` takes the ML snapshot before balances, a non-ACTIVE `MARKETPLACE_ML` still commits the POS saga, and historic `LISTING_STOCK` stays unchanged. Flyway V19 only widens the `source_cause` CHECK.

## What was read

1. `gh pr view 97 --json title,body,baseRefName,headRefOid,state,files,commits`. State `OPEN`, base `integration/storecore-int`, head `829c17b4e6a6140de95e4cf58effd8ca6a54fa7a`.
2. `gh issue view 96`. In-scope is the in-saga local cause. Out of scope is live BlackStore, fiscal, the ML dispatcher, `INSERT(variant_id)`, and `ml-inbox-to-projection`.
3. Full `git diff origin/integration/storecore-int` (24 paths). Commits on the branch: `ae473bf`, `829c17b`.
4. Installed projector, not edited by this diff: `DesiredStockProjectionUseCase.project` and `JdbcChannelStockOutboxAdapter.appendDesiredStockChanged` (inserts `channel_outbox_delivery.status` as `PENDING` only).
5. V17 `source_cause` CHECK, compared with V19. `JdbcInventoryService.acquireScope` lock order, compared with `lockVariants`.

## Diff judged

| Path | Change |
| --- | --- |
| `JdbcBlackStoreSagaEngine` | Removes the post-commit `.also` calls. `mutateReserved` calls `lockVariants`, then the stock body, then `requestProjection` only when the snapshot allows emit, still inside `tx.execute`. |
| `LegacyBlackStoreProjectionBridge` | Delegates to `DesiredStockProjectionUseCase` for a non-empty id set and a known cause. Empty ids or `Unknown` return `NOT_ELIGIBLE` and do not write. |
| `ProjectionSourceCause` | Adds `EXTERNAL_BLACKSTORE_COMMIT` / `RELEASE` / `EXPIRY`. `fromWire` of any other token, including `EXTERNAL_BLACKSTORE_LIVE`, stays `Unknown`. |
| `ChannelProjectionLockOrder.lockVariants` | Snapshot, then accounts for those variants, then products, variants, balances, listings `FOR UPDATE`. Returns whether `MARKETPLACE_ML` is `ACTIVE` with no live kill. |
| `V19__dsp009_blackstore_projection_causes.sql` | Drops the existing `source_cause` check and adds one named CHECK. No GRANT, no delivery column, no new table. |
| `Dsp009BlackStoreBridgeTest` | ML disabled: commit leaves historic `LISTING_STOCK` byte-for-byte and writes no `STOCK_DESIRED_CHANGED`. ML active: one `PENDING` `STOCK_DESIRED_CHANGED` with `EXTERNAL_BLACKSTORE_COMMIT`; a second commit does not append another row. |
| Other BlackStore tests | Port lambda updated to two parameters and still returns `NOT_ELIGIBLE`. |
| SDD | STATUS ceiling moves to V19, next free V20 with no file. WIP stays open. Task `TASK-DSP-009` is `in_progress`. |

`finishReserve` calls `lockVariants` and discards the flag. Reserve does not call the bridge.

## Scope checks

| Check | Result |
| --- | --- |
| In-saga delegation when ML is ACTIVE | PASS. Projection runs inside `mutateReserved`'s `tx.execute`, after the stock update and before the transaction returns. The old post-commit `.also` is gone. `DesiredStockProjectionUseCase.project` is `@Transactional` with default `REQUIRED`, so a Spring call joins that transaction. |
| ML not ACTIVE does not fail the POS saga | PASS. `lockVariants` still takes the locks and returns false. The bridge is not called. `commitWithoutMl…` expects zero desired-changed rows and `MARKETPLACE_ML` left `DISABLED`. |
| No live OAuth | PASS. No HTTP client, token exchange, or secret. The new test inserts `oauth_secret_reference='ref:dsp009'` as a local account row. |
| No dispatcher delivery transition | PASS. This diff does not update `channel_outbox_delivery`. The existing append inserts `PENDING` and is not a sender. No dispatcher type appears in the diff. |
| No `GRANT INSERT(variant_id)` | PASS. V19 has no `GRANT`. TRACEABILITY still records the POSC residual `INSERT(variant_id)=false`. |
| Flyway is V19 CHECK only | PASS. V19 replaces the `source_cause` CHECK with the V17 list plus `WEB_CONSUME` and the three `EXTERNAL_BLACKSTORE_*` wires. It does not edit V1–V18. `Dsp008UpgradeCoexistenceTest` expects a V19 file and no V20 file. |
| Historic `LISTING_STOCK` | PASS. The bridge KDoc and port refuse that kind. The new test compares `to_jsonb` of the seeded legacy row before and after commit. |
| Live companion | PASS for this slice. The test companion row is local and `AfterAll` restores `BLACKSTORE_INTEGRATION` to `DISABLED`. Production code does not flip that module and does not open a companion client. |
| This APPROVED is the local bridge only | PASS. It does not approve live BlackStore, the dispatcher, `master`, hosted CI, or `/sdd.finish`. |

## Validations

| Check | Result |
| --- | --- |
| `git diff --check origin/integration/storecore-int` | Exit 0. |
| Maven | Not started. |
| Hosted Verify run [36765890999](https://github.com/AgustinFalcon/storecore/actions/runs/36765890999) on `829c17b` | `failure`. Jobs `backend` `110059834002` and `frontend` `110059833666` both have `steps: []`. The backend annotation says the job was not started because recent account payments failed or the spending limit needs to be increased. That is not CI green. |

## Gaps

No scope change requested. `tasks.json` `notes` still say the bridge stays fail-closed and that no BlackStore caller belongs to this feature; the new `TASK-DSP-009` row, STATUS, and the changelog already describe the local in-saga bridge. The new test asserts commit, not a separate release or expiry case; both go through the same `mutateReserved` path and `projectionCause`.
