VERDICT: APPROVED

# Grok 4.7 — TASK-DSP-001 scope / implementation

**Lane:** SCOPE / implementation  
**Branch:** `feature/dsp001-account-purpose`  
**Base:** `origin/integration/storecore-int` (`878461f`)  
**SHA reviewed:** `0186aa3`  
**Diff:** `git diff origin/integration/storecore-int...HEAD`  
**No merge.** No CI green claim. No `/sdd.finish`.

## Focused validation (Luna-recorded, not re-run)

| Suite | Result |
|-------|--------|
| `Dsp001AccountPurposeTest` | exit 0 |
| `ChannelAccountPurposeTest` | exit 0 |
| `Dsp000bMlCapabilityGuardTest` | exit 0 |
| `Posc002fAcceptanceMatrixTest` (Flyway V1–16) | exit 0 |

Local Maven only. Not CI green.

## Scope verdict

- **V16** adds typed `purpose`, revision columns, and `ck_channel_account_purpose`; backfill `UNCLASSIFIED`. No `ml_webhook_bindings`, `channel_listing_stock_projection`, `STOCK_DESIRED_CHANGED`, dispatcher, or live ML.
- **Hex ports:** `CreateListingMappingUseCase` → `CapabilityDecisionPort` + `MarketplaceAccountSelectorPort` + `ChannelListingMappingPort`; JDBC adapters stay infrastructure-only.
- **Closed types:** `ChannelAccountPurpose`, `ChannelAccountState`, `MarketplaceChannel` use private constructors, static instances, single `fromWire`, and `Unknown` fail-closed at the selector boundary.
- **Explicit account_id:** `CreateListingMappingCommand.accountId` required; missing/zero → `ML_ACCOUNT_ID_REQUIRED`; selector validates exact id for `MERCADO_LIBRE` + `ACTIVE` + `EXTERNAL_ML_SYNC` with no `ORDER BY` and no `account_key` literal.
- **`JdbcMercadoLibreService.notify` preserved:** still selects first ACTIVE ML account via `ORDER BY id LIMIT 1` excluding `manual-price-writer`; `saveListing` first-ACTIVE path removed (not notify).
- **`JdbcPromoService`:** new `manual-price-writer` rows insert `INTERNAL_PRICE_POLICY`; promo path does not call selector or proyector.
- **Frontend:** `accountId` wired through entity, mapper, store validation, form, and PUT body; no pixel/visual QA claimed.

## New gaps vs existing reviews

1. **P3 — selector negative matrix incomplete:** no test for `EXTERNAL_ML_SYNC` account in `PAUSED`/`ERROR`/`READ_ONLY`, or non-`MERCADO_LIBRE` channel with otherwise valid id (logic present in `JdbcMarketplaceAccountSelector`, untested).
2. **P3 — HTTP/controller slice:** no `CommerceHttpIntegrationTest` (or equivalent) for PUT `/api/v1/user/mercadolibre/listings/{id}` rejecting missing `accountId` at the Jakarta boundary; use-case tests cover the application path only.
3. **Documented residual (not 001 defect):** `JdbcMercadoLibreService.account()` still uses first-ACTIVE `ORDER BY id LIMIT 1`; spec explicitly leaves `notify`/`account` ingress out of TASK-DSP-001 — future webhook-binding task must replace, not silently extend 001.
4. **Documented residual:** V16 backfill intentionally leaves all pre-existing accounts (including legacy `manual-price-writer`) as `UNCLASSIFIED`; only net-new promo inserts get `INTERNAL_PRICE_POLICY`. Operator audit reclassification remains a follow-on gate, consistent with spec §Flyway fail-closed.
5. **SDD bookkeeping:** `tasks.json` shows `stats.done: 4` while `TASK-DSP-001` remains `in_progress` — reconcile on merge close-out, not a code blocker.

No P0: no wrong writer, no notify→selector rewrite, no projection DDL leak, no webhook table, no dispatcher, no secrets, no live ML, no CI-green assertion.
