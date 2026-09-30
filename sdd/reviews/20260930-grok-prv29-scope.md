VERDICT: APPROVED

# Grok 4.7 — PRV-29 scope (TASK-DSP-003)

**Lane:** SCOPE  
**Task:** TASK-DSP-003 — immutable `STOCK_DESIRED_CHANGED` outbox + `PENDING` delivery  
**Branch:** `feature/dsp003-stock-desired-changed`  
**SHA reviewed:** `76683e9859ffaffc79401eabd3b58df1be057898`  
**Base:** `origin/integration/storecore-int` @ `edf5dcb` (TASK-DSP-002 merge #86)  
**Reviewed diff:** `git diff edf5dcb..76683e9` — 13 files, +453 / −17  
**No merge.** This file does not approve GitHub, does not call CI green, and does not authorize `/sdd.finish`.

## SDD why

TASK-DSP-003 adds the immutable outbox intent for desired-stock projection: when snapshot state is `EMITTED`, append `STOCK_DESIRED_CHANGED` with monotonic `projection_version` and a `PENDING` delivery row in the same `@Transactional` unit as the snapshot write. `WITHHELD` snapshots must not emit outbox. No dispatcher, live ML caller, notify/webhook activation, BlackStore activation, or rewrite of `SALE_APPLIED`. Inventory callers remain for TASK-DSP-004.

## What was read

1. Full diff `edf5dcb..76683e9` (13 paths only; no backend surface outside commerce + one Posc002f Flyway assertion).
2. `V18__dsp003_stock_desired_changed_outbox.sql` — additive V18; V1–V17 untouched.
3. `ChannelStockOutboxPort`, `JdbcChannelStockOutboxAdapter`, `DesiredStockProjectionUseCase`, domain kinds/outcomes.
4. `Dsp003StockDesiredChangedTest` (emitted vs withheld, rollback trigger, `SALE_APPLIED` coexistence, BLACKSTORE DISABLED).
5. `Dsp002MonotonicSnapshotTest` and `Posc002fAcceptanceMatrixTest` deltas (outbox port wiring, V18 in Flyway list).
6. Negative scope: `InboxApplicationWorker.kt`, `MercadoLibreController.kt`, `mporders/*` — zero diff vs base.
7. WIP acceptance for TASK-DSP-003 in `sdd/wip/20260924-ml-desired-stock-projection/3-tasks/tasks.json`.

## Scope confirmations

| Gate | Result |
|------|--------|
| V18 additive only | PASS — new column `projection_version`, CHECK/indexes, `channel_outbox_stock_projection` child table, immutability trigger, runtime INSERT grants; header states no dispatcher/webhook/live ML |
| `ChannelStockOutboxPort` + adapter | PASS — port defines `DesiredStockChangedIntent`; adapter inserts `channel_outbox` (`STOCK_DESIRED_CHANGED`), projection row, and `channel_outbox_delivery` with `PENDING` only |
| `DesiredStockProjectionUseCase` | PASS — `ProjectionState.Withheld` → early return, no outbox; `Emitted` → `appendDesiredStockChanged` then `DesiredStockOutcome.Projected` |
| WITHHELD skips outbox | PASS — UNCLASSIFIED account test asserts zero `STOCK_DESIRED_CHANGED` rows |
| EMITTED appends PENDING | PASS — external ML sync listing test asserts outbox + delivery `PENDING` + projection side table |
| Rollback on delivery failure | PASS — `deliveryFailureRollsBackSnapshotAndOutbox` trigger on `channel_outbox_delivery` INSERT rolls back snapshot, outbox, and `channel_listings.desired_quantity` |
| `SALE_APPLIED` path untouched | PASS — no diff on `InboxApplicationWorker.kt`; test inserts legacy `SALE_APPLIED` without `projection_version`; CHECK allows non-`STOCK_DESIRED_CHANGED` kinds with NULL version |
| No dispatcher | PASS — no new worker/scheduler; no code transitions delivery beyond INSERT `PENDING` |
| Notify / webhook untouched | PASS — zero diff on notify controllers/services and mporders ingress |
| No webhook table | PASS — V18 does not create `ml_webhook_bindings` or any webhook DDL |
| BLACKSTORE DISABLED | PASS — test asserts `module_configurations.state='DISABLED'` for `BLACKSTORE_INTEGRATION`; no blackstore production code in diff |
| No live ML / secrets / network | PASS — new Kotlin/SQL paths are JDBC-only; no HTTP client, OAuth call, or secret reference |
| P0 blockers | NONE — no dispatcher, live ML, secrets, CI-green claim, or `SALE_APPLIED` rewrite |

## Validation (recorded, not re-run)

Luna reported Maven exit 0 on:

- `Dsp003StockDesiredChangedTest`
- `Dsp002MonotonicSnapshotTest`
- `Posc002fAcceptanceMatrixTest` cases 1–18

This reviewer did **not** execute Maven per instruction.

## Non-blocking notes (do not change verdict)

- `DesiredStockOutcome.SnapshotAdvanced` remains in the closed type but the use case now returns `Projected`; wire is distinct and tests updated — acceptable for DSP-003 boundary.
- Rollback test covers snapshot/outbox/listing compat column, not inventory balance mutation; balance+projection atomicity is explicitly deferred to TASK-DSP-004 (correct layering).
- `DesiredStockProjectionUseCase` is still exercised only from tests; production wiring awaits DSP-004 callers — in scope for this task.

## Gaps

None that constitute scope violation or P0/P1 for TASK-DSP-003. Hosted CI status not evaluated and not claimed green. Merge to integration still requires the paired implementation review lane and dual Grok APPROVED per repo rule.
