VERDICT: APPROVED

# Grok 4.7 — TASK-DSP-004 scope (prv30)

**Lane:** SCOPE  
**Task:** TASK-DSP-004 — Integrar proyección local con protocolo único de inventario  
**Branch:** `feature/dsp004-inventory-callers`  
**SHA reviewed:** `c7c92e8`  
**Base:** `origin/integration/storecore-int` @ `211e7c6` (TASK-DSP-003 merge #87)  
**Reviewed diff:** `git diff origin/integration/storecore-int...c7c92e8` — 11 files, +529 / −84  
**No merge, push, or `/sdd.finish`.** Maven not re-run in this review (Luna evidence recorded below).

## SDD why

TASK-DSP-004 wires WEB/MP inventory callers to the canonical lock order and shared transactional projector introduced in TASK-DSP-003. It adds internal `releaseSaga` for MP terminal-unpaid verification, multi-SKU `reserveAll`, and projection hooks on reserve/consume/release/expiry/adjustment — without dispatcher, live ML/network, secrets, inbox ML caller, or BlackStore/PIC-009 activation. `InboxApplicationWorker` and `consumeChannelSale` stay deferred to future WIP.

## P0 gate

| Gate | Result |
|------|--------|
| Dispatcher / delivery claim | **Pass** — no dispatcher, no delivery status transitions |
| Live ML / network / OAuth | **Pass** — `mlSyncHeld()` reads `marketplace_ml_sync_snapshot()` locally only; no HTTP/refetch added |
| Secrets / credentials | **Pass** — none in diff |
| CI-green claimed | **Pass** — progress/STATUS do not assert remote CI green |
| `InboxApplicationWorker` rewritten | **Pass** — file absent from diff; still calls `consumeChannelSale` unchanged |
| WEB checkout when `MARKETPLACE_ML` DISABLED | **Pass** — `mlSyncHeld()` fail-closed skips `project()`; `Dsp004InventoryCallersTest` reserves with ML disabled and asserts zero stock outbox |

## Scope alignment (diff read)

- **`JdbcInventoryService.acquireScope`:** calls `marketplace_ml_sync_snapshot()` first (guard snapshot without throwing `decide`), then locks accounts → products → variants → orders → attempts → reservations → balances → listings ASC; mutates; `projectIfEligible` only when snapshot state is ACTIVE and no live kill switches.
- **`reserveAll` / checkout:** `JdbcCartService.checkout` wraps claim + `reserveAll` + order/payment/shipment in one `TransactionTemplate.execute`; lines sorted by `variantId`.
- **`releaseSaga`:** idempotent WEB internal release (ledger RELEASE, restore available/reserved, status RELEASED); early exit on CONSUMED or empty ACTIVE; first caller `MpOrderApplicationWorker.terminateUnpaid`.
- **`MpOrderApplicationWorker`:** `terminateUnpaid` → `releaseSaga`; `consumeOrReview` batch via `reserveAll` + `consumeSaga(..., orderId, attemptId)`; redundant `FOR UPDATE` on attempt/order removed in favor of inventory scope locks.
- **`ProjectionSourceCause.WebConsume`:** added to closed type and used in `consumeSaga`.
- **`consumeChannelSale`:** body unchanged — no ML inbox projection caller (explicitly out of scope).
- **`DesiredStockProjectionUseCase`:** `open` for same-TX participation; still calls `decide` only when projection is actually emitted.
- **Flyway / ACL:** no migrations in diff.
- **Tests in diff:** `Dsp004InventoryCallersTest` — multi-SKU reserve/consume/release replay, expiry batch, delivery-failure rollback, ML-disabled reserve.

## Validation (Luna-reported, not re-run)

Per Luna: `mvn` exit 0 on `Dsp004InventoryCallersTest`, `MpOrdersCheckoutIntegrationTest`, and two `CommerceHttpIntegrationTest` methods. This review treats that as recorded evidence only.

## Gaps (P1 — non-blocking for SCOPE)

- **TASK-DSP-006 deferred:** no PG16 concurrency / inverse multi-SKU / admin-vs-emission race tests in this diff.
- **MP lock unit:** `accredit` / `terminateUnpaid` still mutate payment/order/attempt before inventory calls; full single-unit rollback of order state + inventory on delivery failure is not proven in diff tests (Luna MP integration pass is noted, not re-verified here).
- **`WebConsume` projection cause:** test asserts consume does not bump outbox version (UNCHANGED path); does not assert `source_cause=WEB_CONSUME` on a version bump.
- **Full R01/R02:** lifecycle/catalog callers (`JdbcCatalogService.saveProduct`, listing activation) remain TASK-DSP-005; not required for TASK-DSP-004 scope sign-off.

## Conclusion

Diff stays within TASK-DSP-004 boundaries. No P0 scope violations. Suitable to proceed toward dual implementation review and integration PR; merge still requires second Grok lane APPROVED and honest SDD close-out per repo rules.
