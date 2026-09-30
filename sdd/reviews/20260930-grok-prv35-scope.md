VERDICT: APPROVED

# Grok 4.7 — TASK-DSP-R01 scope (WIP after 008 merged)

**Lane:** SCOPE
**Object:** `sdd/wip/20260924-ml-desired-stock-projection/` as a whole after TASK-DSP-008 merged. This note does not approve GitHub, does not call CI green, and does not authorize `/sdd.finish`, merge, push, tag, deploy, or secrets.
**Branch:** `feature/dsp-r01-r02` = `origin/integration/storecore-int`
**SHA reviewed:** `246662aa4ac5d903c3428b08a088ac7d6be85e57` (`246662a`, TASK-DSP-008 merge #92)
**Merge-base with `origin/master`:** `6831a135e9cb74627b995ca6f4472f757416b3f3`
**DAG judged:** 000A `56baa2d` (#52) through 008 `246662a` (#92). `origin/master...HEAD` also contains the parallel POS convergence migrations V8–V14; those are not callers of this projector and are outside this WIP.

## What was read

1. `3-tasks/tasks.json` (000A–008 `done`, R01/R02 `pending`, `stats.done` 12/14). SDD why: `meta.md` (local `STOCK_DESIRED_CHANGED` + `PENDING` only; no send, credentials, claim, or `SENT`/`FAILED`/`DEAD`), `1-functional/spec.md` BR-DSP-03/04/07/08 (no dispatcher; ML inbox is a future WIP; PIC-009 bridge stays fail-closed until a separate PIC-005 GO), `2-technical/spec.md` (future dispatcher, `notify`, webhook binding DDL, and `InboxApplicationWorker` are out of scope; deliveries stay `PENDING`; no claim query).
2. `sdd/STATUS.md` residuals: MP-LIVE-05, fiscal, and live stay NO-GO; hosted jobs with `steps=[]` are not CI green; POSC runtime `INSERT(variant_id)` stays false; BlackStore live and the ML dispatcher stay deferred. The stock bullet still describes 008 as unmerged; git HEAD is the #92 merge. That lag does not expand the DAG.
3. `4-implementation/progress.md` still says the 008 merge is pending and refuses dispatcher, network, secrets, and `sdd.finish`. The feature directory remains under `sdd/wip/`. `sdd/features/20260924-ml-desired-stock-projection/` does not exist.
4. Production boundaries: `DesiredStockProjectionUseCase`, `JdbcChannelStockOutboxAdapter`, `JdbcInventoryService`, `ListingLifecycleUseCase`, `CreateListingMappingUseCase`, `CatalogService` reproject, `LegacyBlackStoreProjectionBridge`, `JdbcMercadoLibreService.notify`, `InboxApplicationWorker`, `JdbcPromoService`, Flyway `V15`–`V18`. On-disk migrations stop at `V18__dsp003_stock_desired_changed_outbox.sql`. No `V19__` file.

## SDD why

The feature materializes a local projection and a durable `STOCK_DESIRED_CHANGED` intention whose new delivery is `PENDING`. It does not send to Mercado Libre, does not use live credentials, does not claim deliveries, and does not mark `SENT`, `FAILED`, or `DEAD`. Callers in scope are WEB/MP inventory, listing lifecycle, and catalog atomicity. `notify`, `InboxApplicationWorker`, and promo stock sync stay out. Upgrade coexistence keeps historic `LISTING_STOCK` beside the versioned kind. The effective Flyway ceiling is V18; V19 is the next free number and has no file.

P0 NO-GO for this lane: a dispatcher or a `SENT` writer, live Mercado Libre OAuth/network, a Flyway V19 file, a BlackStore live caller, an `INSERT(variant_id)` grant on `inventory_balances`, a claim that CI is green, or `/sdd.finish`.

## In-scope DAG

| Task | What landed | Still inside |
| --- | --- | --- |
| 000A `#52` `56baa2d` | Removed `JdbcBlackStoreMlListingAdapter`. `LegacyBlackStoreProjectionBridge.requestProjection` returns `NOT_ELIGIBLE`. | Fail-closed bridge. No HTTP, no new `LISTING_STOCK`, `BLACKSTORE_INTEGRATION` not activated. |
| 000B `#84` | `V15__dsp000b_ml_sync_capability_guard.sql`: `SECURITY DEFINER` snapshot for the constant pair `MARKETPLACE_ML`/`SYNC`; PUBLIC/runtime EXECUTE revoked on the V3 admin entry points. | Local guard. No network. |
| 001 `#85` | `V16` purpose `UNCLASSIFIED` / `EXTERNAL_ML_SYNC` / `INTERNAL_PRICE_POLICY`. Create listing takes an explicit `account_id`. Promo insert sets `INTERNAL_PRICE_POLICY`. `saveListing` first-account `ORDER BY` path removed. | `notify` body not rewritten. No ML caller added. |
| 002 `#86` | `V17` `channel_listing_stock_projection`. | Local snapshot. Backfill is withheld quarantine, not a remote publish. |
| 003 `#87` | `V18` kind `STOCK_DESIRED_CHANGED` with required `projection_version`. Adapter inserts outbox, snapshot row, and delivery. | Delivery insert uses `OutboxDeliveryStatus.Pending` only. |
| 004 `#88` | `reserve` / `consumeSaga` / `releaseSaga` / `expireOverdue` / `adjust` / `setAvailableQuantity` call the projector. | WEB and MP inventory. `consumeChannelSale` (the ML sale ledger path) does not project. |
| 005 `#89` | Listing create/activate/pause/remap/confirm and catalog `reproject`. | Lifecycle and `saveProduct` atomicity. Promo service has no projector call. |
| 006 `#90` | `Dsp006ConcurrencyTest`. | Tests. No production dispatcher. |
| 007 `#91` | `LoggingDesiredStockProjectionObserver` logs `remote_delivery=false`. `JdbcDesiredStockPendingStats` counts `PENDING` rows. | Local metrics. The stats query does not claim or update delivery. |
| 008 `#92` `246662a` | `Dsp008UpgradeCoexistenceTest` plus docs. `git show --stat 246662a` has no `backend/src/main` and no migration. | Historic `LISTING_STOCK` coexistence. No BlackStore caller. |

Tests present: `Dsp000bMlCapabilityGuardTest`, `Dsp001AccountPurposeTest`, `Dsp002MonotonicSnapshotTest`, `Dsp003StockDesiredChangedTest`, `Dsp004InventoryCallersTest`, `Dsp005ListingLifecycleTest`, `Dsp006ConcurrencyTest`, `Dsp007ObservabilityTest`, `Dsp008UpgradeCoexistenceTest`.

## Still out

- `JdbcMercadoLibreService.notify` still admits an inbox row and returns `applied=false`. It reads `oauth_secret_reference` and does not open an HTTP client. DSP-001 did not edit that function.
- `InboxApplicationWorker` has no commit on `origin/master..HEAD`. Its outbox insert remains `kind='SALE_APPLIED'`. It is not a desired-stock caller. `ml-inbox-to-projection` stays future.
- `JdbcPromoService` does not reference the projector. Internal price-policy listings are not a stock-sync path.
- No `ml_webhook_bindings` migration. The technical spec keeps that DDL as a future ingress gate.

## P0 bar

| Bar | At `246662a` |
| --- | --- |
| Dispatcher / `SENT` | No claim query and no `UPDATE` of `channel_outbox_delivery`. The only desired-stock write is `INSERT ... Pending`. `OutboxDeliveryStatus.Sent` / `Failed` / `Dead` exist so `fromWire` can name historical rows; nothing in this DAG assigns them. `JdbcDesiredStockPendingStats` only counts `PENDING`. |
| Live ML OAuth / network | No Mercado Libre host, OAuth token call, `RestClient`, or `WebClient` under the projector, outbox adapter, observer, or BlackStore bridge. `OfficialOrderApiAdapter` is the pre-existing Mercado Pago client and has no commit on `origin/master..HEAD`. |
| Flyway V19 | Absent. DSP migrations are V15–V18. V18 comment states no dispatcher and no live ML caller. |
| BlackStore live caller | Bridge returns `NOT_ELIGIBLE` and does not call `DesiredStockProjectionUseCase`. 000A removed the direct desired-quantity / `LISTING_STOCK` writer. |
| `INSERT(variant_id)` grant | V15–V18 do not `GRANT` on `inventory_balances`. The POS residual `INSERT(variant_id)=false` is untouched. V18 `GRANT INSERT` is on `channel_outbox`, `channel_outbox_delivery`, and `channel_outbox_stock_projection` (snapshot column `variant_id` on the outbox child, not the balance-row grant). |
| Claimed CI green | CHANGELOG entries for 000B–008 record merges and local bounds. 008 does not attach a green Verify. STATUS still says hosted `steps=[]` is not CI green. This lane did not read a green run. |
| `/sdd.finish` | Absent. R01 and R02 stay `pending`. The WIP is not under `sdd/features/`. Progress names `sdd.finish` only to refuse it. |

## Validation

`git diff --check 56baa2d^..HEAD` on the commerce tree, the BlackStore tree, and `V15`–`V18`, exit 0. This lane did not re-run `mvn -q test`. Local diff check only. Not CI green.

## Gaps

None that change this verdict.

`sdd/STATUS.md` header records `246662a` / #92, while the stock bullet still says 008 is on `feature/dsp008-upgrade-coexistence` and the DAG is 11/14 until that merge. `progress.md` and the 008 task description still say the merge is pending. `tasks.json` `notes` still say 000B and later tasks remain pending, which disagrees with `stats.done` 12 and the `done` statuses. `meta.md` phase 4 still says 002 is in progress. The bridge KDoc still says this build has no canonical projector; the method still returns `NOT_ELIGIBLE`, which is the PIC-005 gate in BR-DSP-08. Those sentences lag the merge. They do not add a caller, a migration, a delivery transition, a CI pass, or an archive.
