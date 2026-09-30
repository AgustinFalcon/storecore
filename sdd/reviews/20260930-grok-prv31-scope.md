VERDICT: APPROVED

# Grok 4.7 — TASK-DSP-005 scope (prv31, round 2)

**Lane:** SCOPE  
**Round:** 2  
**Task:** TASK-DSP-005 — Endurecer lifecycle de listing y catálogo  
**Branch:** `feature/dsp005-listing-lifecycle`  
**Committed HEAD:** `ec1c890`  
**Working tree:** includes uncommitted `Dsp005ListingLifecycleTest` (pause `WITHHELD` assert + AC-DSP-11 `saveProduct` delivery-fail). Those tests are in-scope coverage, not a scope expansion.  
**Base:** `origin/integration/storecore-int` @ `f82eed1` (TASK-DSP-004 PR #88)  
**Reviewed diff:** `git diff origin/integration/storecore-int` (committed + unstaged), 15 files, +479 / −33. Committed-only `f82eed1..ec1c890` was +415 / −33. Untracked review drafts are not part of the slice.  
**No merge, push, deploy, tag, publish, secrets, or `/sdd.finish`.** This file does not approve GitHub. It does not call CI green.

## SDD why

TASK-DSP-005 (BR-DSP-05, BR-DSP-09, AC-DSP-06/07/11) separates create (external listing starts `PAUSED`), activate, pause, remap with `manual_intervention_required` plus audit, and confirm-mapping baseline. `saveProduct`, active state, balance, projection, outbox, and `PENDING` delivery share one transaction. Out of scope, and absent here: dispatcher, live ML/network/OAuth, secrets, `notify` rewrite, promo stock sync, `InboxApplicationWorker`, fiscal/ARCA, BlackStore live connector, Flyway V19, `INSERT(variant_id)` grant, `/sdd.finish`, PIC-005 GO. Concurrent admin races and full lock matrices stay in TASK-DSP-006; observability in 007; upgrade coexistence in 008. This lane does not demand them.

## P0 gate

| Gate | Result |
|------|--------|
| Dispatcher / delivery claim / SENT | **Pass** — no dispatcher, claim, or delivery status transition. Withheld snapshots return before `outbox.append`. The new test only aborts `INSERT` on `channel_outbox_delivery` and drops that trigger. |
| Live ML / network / OAuth | **Pass** — activate/pause/confirm-mapping are local operator POSTs (CSRF + same-origin) into the projector. No HTTP client, refetch, or OAuth flow. |
| Secrets / credentials | **Pass** — no new secret. Test fixture `oauth_secret_reference='ref:dsp005'` matches the existing reference pattern. |
| CI-green claimed | **Pass** — STATUS, progress, and CHANGELOG do not assert remote CI green. 005 stays `in_progress`. |
| `notify` rewritten | **Pass** — `MercadoLibreController.notify` still delegates to `mercadoLibre.notify`. |
| Promo stock sync | **Pass** — `JdbcPromoService` is not in the diff. Create still calls `requireExternalMlSync`. |
| `InboxApplicationWorker` rewritten | **Pass** — file absent from the diff. |
| Flyway V19 or `INSERT(variant_id)` grant | **Pass** — no migration and no GRANT. Focused test log applied V1–V18 only. |
| BlackStore caller | **Pass** — no BlackStore type or caller. The test asserts `BLACKSTORE_INTEGRATION` stays `DISABLED` and `LISTING_STOCK` count stays 0. |

## Scope alignment

Every changed path belongs to 005 or to bookkeeping of the `f82eed1` base:

- `ListingLifecycleAction`, `ListingLifecycleUseCase`, `ChannelListingMappingPort`, `JdbcChannelListingMappingAdapter`: closed action type; create inserts `PAUSED`; remap sets intervention, bumps revision, forces `PAUSED`, audits `LISTING_REMAP_BLOCKED`; activate rejects intervention; confirm clears it, audits `LISTING_MAPPING_CONFIRMED`, and baselines.
- `CreateListingMappingUseCase`: one transaction around capability, account, upsert, audit, and project (`ListingPaused` or `ListingRemapped`, `forceBaseline` only on create/remap).
- `DesiredStockProjectionUseCase`: `forceBaseline` defaults to false, so existing inventory callers keep the UNCHANGED short-circuit. Withheld still skips outbox.
- `JdbcCatalogService.saveProduct` (catalog path required by BR-DSP-09, outside the commerce files glob) and `JdbcInventoryService.reproject`: catalog mutation, quantity, and projection join the same `TransactionTemplate`. `reproject` does not add a delivery claim.
- `MercadoLibreController`: three local lifecycle routes. Notify body unchanged.
- `Dsp001AccountPurposeTest`: constructor wiring only, after `CreateListingMappingUseCase` gained projection and transaction dependencies.
- `Dsp005ListingLifecycleTest`: committed lifecycle flow plus uncommitted pause `projection_state=WITHHELD` and `saveProductDeliveryFailureRollsBackCatalogBalanceAndOutbox` (product name, balance, outbox count, desired quantity). That is the 005 half of AC-DSP-11. It is not a 006 race matrix.
- `CHANGELOG.md`, `sdd/STATUS.md`, `tasks.json`, `progress.md`: 004 recorded done at `#88` / `f82eed1`; 005 remains `in_progress`; done count 8/14; no `sdd.finish`.

`git diff --check origin/integration/storecore-int` was clean.

## Validation

This lane ran, from `backend/`, against the working tree (no other Maven process was running):

`mvn -q "-Dtest=Dsp005ListingLifecycleTest" test` → exit 0.

Flyway in that run validated and applied 18 migrations, schema at V18. Local focused evidence only. Not remote CI. Full suite was not run.

## Round-1 notes

Round 1 APPROVED with two non-blocking notes. Both are closed in the working tree: pause now asserts `WITHHELD`, and the AC-DSP-11 saveProduct delivery-fail test is present. Neither pulls dispatcher, V19, notify, promo sync, inbox worker, or BlackStore into this slice. Concurrent toggles, lock matrices, metrics, and upgrade quarantine stay deferred (006 / 007 / 008) and are not requested here.

## Conclusion

The working-tree diff stays inside TASK-DSP-005. No P0 scope violation. SCOPE APPROVED for round 2. Merge still needs the other Grok lane APPROVED and an honest SDD close-out. This review does not merge, does not approve the GitHub PR, and does not treat CI as green.
