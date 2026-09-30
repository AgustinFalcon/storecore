VERDICT: APPROVED

# Grok 4.7 — TASK-DSP-R02 scope (lock-order follow-up)

**Lane:** SCOPE
**Object:** uncommitted lifecycle lock-order fix on `feature/dsp-r01-r02`, judged against `JdbcInventoryService.acquireScope` and the global lock protocol in `2-technical/spec.md`. This note does not approve GitHub, does not call CI green, and does not authorize master promotion, a dispatcher, live credentials, PIC-009/BlackStore live, or `/sdd.finish`.
**Branch:** `feature/dsp-r01-r02` tracking `origin/integration/storecore-int`
**Committed HEAD:** `246662aa4ac5d903c3428b08a088ac7d6be85e57` (`246662a`, TASK-DSP-008 merge #92)
**Uncommitted code:** `ChannelProjectionLockOrder.kt` (untracked) plus call sites in `ListingLifecycleUseCase` and `CreateListingMappingUseCase`. SDD bookkeeping updates STATUS, `tasks.json`, `progress.md`, `meta.md`, and the CHANGELOG #92 line. Untracked `sdd/reviews/20260930-grok-prv35-scope.md` and `prv35-sdd.md` are APPROVED on `246662a` and do not cover this fix.

## Why

Combined DSP checks on merge `#92` failed `Dsp006ConcurrencyTest.pauseDoesNotLeaveEmittedOnPausedListing` with `PessimisticLockingFailureException` on `channel_listings`. Pause/lifecycle took the listing `FOR UPDATE` before products, variants, and balances. `acquireScope` (reserve/adjust) takes snapshot, accounts, products, variants, optional order/attempt/reservations, balances, then listings ASC.

## What was read

1. `git diff origin/integration/storecore-int` (tracked edits only) and the untracked helper.
2. `JdbcInventoryService.acquireScope` / `lockBalance` (`JdbcInventoryService.kt` lines 231–278 and 316–319).
3. `DesiredStockProjectionUseCase.project` (decide, then `lockByVariantIds`, then writes in `listingId` order).
4. `JdbcMarketplaceListingProjectionAdapter.lockByVariantIds` (`ORDER BY l.id ASC`, `FOR UPDATE OF l` only) and `write` (projection insert/update, then `desired_quantity` on the listing already locked).
5. `JdbcChannelListingMappingAdapter.upsert` and `lockAndSetState` (`SELECT ... WHERE id=? FOR UPDATE`, then state update).
6. `ListingLifecycleUseCase.execute` and `CreateListingMappingUseCase.execute` call order inside the existing transaction.
7. Technical spec lock protocol: snapshot, accounts, products, variants, orders, attempts, reservations, balances, listings and projection by listing id. Unused tables are omitted. A caller never returns to an earlier step.
8. Migration directory `V1`–`V18`. No `V19__` file. This diff has no SQL.
9. `tasks.json`: R01 and R02 remain `pending`. `stats.done` stays 12/14.

## Lock order

`ChannelProjectionLockOrder.lock` does, in one transaction, before listing mutation:

1. `marketplace_ml_sync_snapshot()` (same function `acquireScope` uses via `mlSyncHeld`, and the same function `decideMarketplaceMlSync` already called).
2. `channel_accounts` `FOR UPDATE` for the command account.
3. `products` by id ASC.
4. `product_variants` by id ASC.
5. `inventory_balances` by variant id ASC (`INSERT ... ON CONFLICT DO NOTHING`, then `FOR UPDATE`), same row ritual as `lockBalance`.
6. `channel_listings` `WHERE variant_id IN (...) ORDER BY id FOR UPDATE`.

Orders, `mp_checkout_attempts`, and `inventory_reservations` are omitted. Lifecycle and mapping do not write those tables, and nothing after step 6 locks them. That matches the spec rule for unused tables.

`acquireScope` locks every account that already has a listing for the variants, sorted by id. The helper locks the single command account at the same step, before products. A reserve that is still waiting on a later account has not taken products yet, so the single-account subset does not invert the pause/reserve pair.

Both use cases call the helper before `upsert` / `lockAndSetState`. Those methods then lock or update the listing row. On a stable `variant_id`, that row is already in the ordered listing set. `projection.project` runs after that and locks listings again with `ORDER BY l.id ASC` before any projection write. Reserve/adjust does the same: `acquireScope` listings, then `project`. The helper does not lock `channel_listing_stock_projection` before listings. `acquireScope` and `lockByVariantIds` do not either (`FOR UPDATE OF l` only). Projection rows are written after those listing locks, in listing id order. Adding an explicit projection lock before listings would be a new reverse edge against that partner. Omitting it keeps the two emitters aligned.

The unlocked `variant_id` read before the helper is the spec's non-authoritative discovery. The failing pause/reserve test does not remap that row between the read and the lock.

## P0 bar

| Bar | This worktree |
| --- | --- |
| Dispatcher / `SENT` | No new claim query and no delivery update. The helper only locks. `DesiredStockProjectionUseCase` is unchanged and still inserts `PENDING` through the existing outbox port. |
| Live ML OAuth / network | No host, token call, `RestClient`, or `WebClient` in the helper or the two call sites. |
| Flyway V19 | No migration file. Directory ends at `V18__dsp003_stock_desired_changed_outbox.sql`. |
| BlackStore live caller | Diff does not touch the bridge. |
| `INSERT(variant_id)` grant | No `GRANT`. The balance `INSERT ... ON CONFLICT DO NOTHING` is the same statement `lockBalance` already uses. It is not a privilege change. |
| Claimed CI green | CHANGELOG only records merge `#92`. STATUS still treats hosted `steps=[]` as not green. This lane saw no hosted run. |
| `/sdd.finish` | Not run. WIP stays under `sdd/wip/`. R01 and R02 stay `pending`. |

## Validation

This lane did not start Maven.

Luna's recorded local results, cited from `4-implementation/progress.md` and not re-run here: focused `Dsp005`+`Dsp006`+`Dsp008`+`Dsp001` in one Maven process, exit 0; combined DSP `000b`–`008`, exit 0, including `pauseDoesNotLeaveEmittedOnPausedListing`. Those are local Testcontainers results. They are not hosted CI.

`git diff --check origin/integration/storecore-int` on this checkout: exit 0. That command does not scan untracked files. The helper was read in full; it has no conflict markers.

Full `mvn -q test` was not observed in this workspace. Full suite not finished.

## R02 disposition

TASK-DSP-R02 stays `pending`. One SCOPE `APPROVED` is not the dual gate. prv35 approved `246662a` without this fix. R02 is not done until this follow-up has both lanes `APPROVED` and is merged only to `integration/storecore-int`. That merge still does not authorize master, tag, deploy, or `/sdd.finish`. The R02 acceptance line that wants a full local `mvn -q test` is not satisfied by the focused DSP runs above.

## Gaps

None that change this verdict.

`InboxApplicationWorker.applyMlItem` updates `channel_listings` and then calls `consumeChannelSale`, which locks `inventory_balances` and does not take the listing prefix. That is the reverse of `acquireScope` and of this helper. The technical spec leaves that worker out of this WIP and forbids turning it into a desired-stock caller. This follow-up does not touch it. It is not the pause/reserve deadlock the DSP suite hit.
