VERDICT: APPROVED

# Grok 4.7 — TASK-DSP-002 scope / implementation

**Lane:** SCOPE / implementation  
**Branch:** `feature/dsp002-monotonic-snapshot`  
**Base:** `origin/integration/storecore-int` (`715f37d`)  
**SHA reviewed:** `a70d4ab`  
**Diff:** `git diff origin/integration/storecore-int...a70d4ab` (16 files, +684/−12)  
**No merge.** No push. No `/sdd.finish`. No CI green claim.

## Focused validation (Luna-recorded, not re-run)

| Suite | Result |
|-------|--------|
| `Dsp002MonotonicSnapshotTest` | exit 0 |
| `Dsp001AccountPurposeTest` | exit 0 |
| `Posc002fAcceptanceMatrixTest` (Flyway V1–17) | exit 0 |

Local Maven only. Not CI green.

## TASK-DSP-002 acceptance

| Criterion | Verdict | Evidence |
|-----------|---------|----------|
| Snapshot = `max(0, available_quantity − safety_stock)` without subtracting `reserved_quantity` | **Met** | `DesiredStockProjectionUseCase.sellable()` uses `maxOf(0, availableQuantity - safetyStock)`; `reservedQuantity` is read in the port row but never used in the formula. `Dsp002MonotonicSnapshotTest` seeds `available=10, reserved=4, safety=2` and asserts `desiredQuantity=8`. V17 backfill uses `GREATEST(0, available − safety)` with no `reserved`. |
| Replay preserves version and does not duplicate snapshot | **Met** | `upsert()` short-circuits to `DesiredStockOutcome.Unchanged` when mapping/eligibility/quantity/state fingerprints match; test asserts replay stays at version `1`. |
| Concurrent changes do not regress version | **Met (partial test)** | `FOR UPDATE OF l` on listings plus optimistic `UPDATE … WHERE projection_version=?`; concurrent threads assert final version `>=` pre-concurrency baseline. Does not assert `PROJECTION_VERSION_CONFLICT` on the loser (see P2). |
| PIC-009 does not write `desired_quantity` or new `LISTING_STOCK` | **Met** | Diff touches no `blackstore/` production code. `LegacyBlackStoreProjectionBridge` unchanged (`NOT_ELIGIBLE`). Test asserts zero `LISTING_STOCK` outbox and `BLACKSTORE_INTEGRATION=DISABLED`. Canonical projector writes `desired_quantity` via `JdbcMarketplaceListingProjectionAdapter` — in scope per spec §DDL (`channel_listings.desired_quantity` as compatibility mirror). |

Referenced ACs: **AC-DSP-01**, **AC-DSP-05** (partial), **AC-DSP-09** (bridge seal preserved; canonical writer is separate from PIC-009).

## Scope boundary checks

| Guard | Verdict |
|-------|---------|
| No `channel_outbox` / `STOCK_DESIRED_CHANGED` DDL (TASK-DSP-003) | **PASS** — V17 creates only `channel_listing_stock_projection`; no outbox kind, delivery, or CHECK changes. Test counts zero `STOCK_DESIRED_CHANGED`. |
| No webhook binding table | **PASS** — absent from diff and V17 header comment. |
| `notify` untouched | **PASS** — `JdbcMercadoLibreService`, `MercadoLibreController`, MP notify controllers not in diff. |
| `BLACKSTORE_INTEGRATION` stays DISABLED | **PASS** — asserted in `Dsp002MonotonicSnapshotTest`; no capability flip in migration or production code. |
| Bridge stays `NOT_ELIGIBLE` | **PASS** — `LegacyBlackStoreProjectionBridge.kt` unchanged; still fail-closed without delegating to the new use case (PIC-005 gate deferred). |

## V17 SQL

- Aditive only; header states no edit to V1–V16.
- Pre-flight checks for orphan listings (`DSP002_BROKEN_LISTING_ACCOUNT`, `DSP002_BROKEN_LISTING_VARIANT`).
- Table `channel_listing_stock_projection` with PK on `listing_id`, version/state/cause CHECKs, withholding reason paired with `WITHHELD`.
- Backfill: version `1`, state `WITHHELD`, reason `UPGRADE_CLASSIFICATION_REQUIRED`, cause `UPGRADE_QUARANTINE`, formula without `reserved_quantity`.
- Runtime ACL: `GRANT SELECT, INSERT, UPDATE`; `REVOKE DELETE`. No dispatcher, webhook, or outbox mutation.

## Implementation notes

- **Hexagonal cut:** `DesiredStockProjectionUseCase` → `MarketplaceListingProjectionPort` → `JdbcMarketplaceListingProjectionAdapter`; capability guard via `CapabilityDecisionPort.decide("MARKETPLACE_ML","SYNC",…)`.
- **Closed types:** `ProjectionState`, `ProjectionSourceCause`, `DesiredStockOutcome`, `ProductCatalogStatus` follow private-constructor + `fromWire` + `Unknown` pattern.
- **Monotonic CAS:** first write INSERT; subsequent writes UPDATE with `expectedVersion`; mismatch → `PROJECTION_VERSION_CONFLICT`.
- **Withholding:** UNCLASSIFIED / inactive account / listing / product / variant / manual intervention → `WITHHELD` with reason; EXTERNAL_ML_SYNC + active chain → `EMITTED`.
- **Compatibility mirror:** adapter updates `channel_listings.desired_quantity` in the same successful write — matches spec §“valor de lectura/compatibilidad”.
- **Not wired to callers yet:** use case is exercised only in `Dsp002MonotonicSnapshotTest`; inventory/checkout integration deferred to TASK-DSP-004 — correct slice boundary.

## New gaps vs existing reviews

1. **P2 — AC-DSP-05 dual-listing matrix missing:** no test for two ACTIVE listings on the same variant receiving independent projections/versions.
2. **P2 — concurrent loser path untested:** threads may throw `PROJECTION_VERSION_CONFLICT`; test only checks monotonic non-decrease, not exactly-one-winner semantics.
3. **P3 — edge `available < safety` → 0:** formula implemented but not explicitly asserted (AC-DSP-01 sub-case).
4. **P3 — bridge KDoc stale:** comment still says “no canonical projector in this build”; `DesiredStockProjectionUseCase` now exists but bridge correctly remains `NOT_ELIGIBLE` until PIC-005 GO — update comment on bridge delegation slice.
5. **P3 — SDD bookkeeping:** `tasks.json` shows `stats.done: 5` while `TASK-DSP-002` remains `in_progress`; reconcile on merge close-out.
6. **Documented residual (not 002 defect):** global lock order (capability snapshot → accounts → products → variants → balances → listings) and transactional caller integration belong to TASK-DSP-004; current slice locks listings only.
7. **Documented residual:** outbox `STOCK_DESIRED_CHANGED`, delivery PENDING, and rollback-on-delivery-failure are TASK-DSP-003+ — correctly absent.

No P0: no outbox/dispatcher, no live ML caller, no webhook binding, no notify rewrite, no BlackStore activation, no secrets, no CI-green assertion, no PIC-009 writer reopening.
