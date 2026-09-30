VERDICT: APPROVED

# Grok 4.7 — TASK-DSP-006 scope (prv32, round 2)

**Lane:** SCOPE
**Round:** 2
**Task:** TASK-DSP-006 — Probar concurrencia, rollback y selección futura
**AC:** AC-DSP-08 (also AC-DSP-04, AC-DSP-05)
**Branch:** `feature/dsp006-concurrency`
**HEAD:** `3e06510d4d1aa23d86920fa19da50e6343a579ae` (`3e06510`)
**Base:** `origin/integration/storecore-int` @ `bdd1c9209176df8b4904e7e2974837b5e4e1fdd0` (`bdd1c92`, TASK-DSP-005 PR #89)
**Reviewed diff:** `git diff origin/integration/storecore-int...HEAD`. 5 files, +793 / −6. Round 2 vs `36950a2` is the test plus the TASK-DSP-005 sentence in `tasks.json` (+198 / −62). Working tree vs that HEAD adds only untracked review files, not product code. `git diff --check origin/integration/storecore-int...HEAD` exited 0.
**No merge, push, deploy, tag, publish, secrets, or `/sdd.finish`.** This file does not approve GitHub. It does not call CI green.

## SDD why

TASK-DSP-006 is the PG16/Testcontainers matrix for snapshot locks, runtime ACL, coalescence-candidate reads, multi-SKU delivery rollback, and admin/inventory races. Out of scope, and absent from this diff: dispatcher, live ML/network/OAuth, secrets, Flyway V19, observability (007), upgrade coexistence (008), fiscal, BlackStore live, `INSERT(variant_id)` grant, `notify` rewrite, and `/sdd.finish`. Production Kotlin under `backend/src/main` is untouched. Round 1 SCOPE was CHANGES_REQUIRED on the matrix gaps listed below. Round 2 closes those gaps inside the test.

## P0 gate

| Gate | Result |
|------|--------|
| Dispatcher / SENT | **Pass** — no dispatcher, claim, or delivery status transition. The test only aborts `INSERT` on `channel_outbox_delivery` for `STOCK_DESIRED_CHANGED` and drops that trigger. |
| Live ML / network / OAuth | **Pass** — Testcontainers and JDBC only. No HTTP client, refetch, or OAuth flow. |
| Secrets | **Pass** — fixture `oauth_secret_reference='ref:dsp006'` is a reference label. The runtime password is a generated UUID inside the test, not a committed credential. |
| CI-green claimed | **Pass** — STATUS, progress, and CHANGELOG do not assert remote CI green. 006 stays `in_progress`. Hosted `steps=[]` is still not green. |
| Production inventory protocol rewrite | **Pass** — `git diff origin/integration/storecore-int...HEAD -- backend/src/main` is empty. |
| New Flyway / V3 body rewrite | **Pass** — no migration file. V3 is not edited. The test calls the existing generic admin function and expects `CAPABILITY_ML_GENERIC_DENIED`. |
| `INSERT(variant_id)` grant | **Pass** — the test `GRANT`s `storecore_runtime`, `CONNECT`, and schema `USAGE` to a throwaway login. It does not grant `INSERT(variant_id)`. |

## Round 1 gaps

1. **Overlapping writers.** `concurrentWritersKeepCurrentVersionAndOldOutboxIsNotCandidate` still seeds two sequential adjusts (version 2, one candidate, one stale row). It then starts two `inventory.adjust` threads. After both return, available is 6 and `projection_version` is 4, so both mutations committed and the current row is the newer version. The candidate join count is 1. Three outbox rows have `projection_version` below that current version.
2. **Admin waits.** `awaitBlockedOnSnapshot` holds `marketplace_ml_sync_snapshot()` on the runtime login, starts the admin call, and requires that call still alive and unfinished after 400ms. It then commits the snapshot and requires the call to finish with no error. That wrapper covers `replaceKill`, `removeKill`, and `changeState` to `DISABLED`. `createKill` remains the earlier `lock_timeout='400ms'` probe: `SELECT … capability_actions … FOR UPDATE` raises while the snapshot share lock is held, and `createKill` runs only after that holder commits. V8 `capability_tx_c_execute` takes `capability_actions` FOR UPDATE before `CHANGE_STATE`, `KILL_CREATE`, `KILL_REMOVE`, and `KILL_REPLACE`. V15 takes FOR SHARE on that action row, then config, then switches.
3. **Consume / release / expiry versus inverse multi-SKU reserve.** `consumeReleaseExpiryRaceInverseMultiSkuReserve` seeds two sagas plus an already-expired reservation, then runs inverse `reserveAll`, `consumeSaga`, `releaseSaga`, and `expireOverdue` together. No thread error. Available ends at 38 on both variants, which is the combined success of those four operations. Each listing has one candidate row. On the high listing, current `projection_version` equals `MAX(channel_outbox.projection_version)`.
4. **Snapshot JSON.** `runtimeLoginAllowsSnapshotDeniesDdlHistoricalDmlAndV3` parses `marketplace_ml_sync_snapshot()` and asserts `moduleCode=MARKETPLACE_ML`, `actionCode=SYNC`, non-blank `actionKind`, `state=DISABLED`, `configVersion >= 1`, and `switches` as an array. Those names match the V15 `jsonb_build_object`. V15 rejects a null or out-of-set `action_kind` before it returns that JSON.
5. **Pause.** `pauseDoesNotLeaveEmittedOnPausedListing` requires both threads to return without error, then always asserts listing `PAUSED` and `projection_state=WITHHELD`.
6. **TASK-DSP-005 sentence.** `tasks.json` now says merge to integration by PR #89, commit `bdd1c92`. Status of 005 stays `done`. Status of 006 stays `in_progress`. `stats` done count is unchanged. STATUS still records DAG 9/14 until 006 merges. CHANGELOG describes the matrix and does not claim a 006 merge.

## AC coverage

- Two writers do not leave an old version current, and the older outbox row is outside the candidate join.
- Create (lock-timeout probe), replace, remove, and changeState serialize with the snapshot share lock. Disable-after-snapshot still adds no second outbox row. The pause race ends withheld.
- Failed multi-SKU `reserveAll` in the same transaction as order, payment, and attempt updates still rolls back to `CREATED` / `PENDING` / `CREATED`, restores both balances, and leaves reservations, ledger, outbox, and projection at 0.
- Inverse `reserveAll` still finishes at available 18/18. Consume, release, and expiry against a further inverse reserve finish without deadlock and without a second candidate row.
- Runtime login still reads the snapshot under `search_path=pg_temp, public` and is denied DDL, projection `DELETE`, outbox `UPDATE`, and `EXECUTE` on `capability_admin_change_configuration`. Generic V3 raises `CAPABILITY_ML_GENERIC_DENIED`. `BLACKSTORE_INTEGRATION` stays `DISABLED`. `LISTING_STOCK` count stays 0.
- No API, network, or committed secret. No claim query was added.

## Residuals (non-blocking)

- `actionKind` is asserted non-blank. The closed set is enforced inside V15 before the function returns. `switches` is asserted as an array; it may be empty when no kill is active. The runtime read runs before `createKill`.
- The consume/release/expiry race checks `projection_version = MAX(outbox.projection_version)` on the high listing. The low listing checks candidate count 1 only. Both listings are written by the same `reserveAll`.
- `join`’s boolean is not asserted. Completion is the quantity and version assertions (available 6 and version 4; available 38/38; `PAUSED`).
- Failed delivery is still the multi-SKU reserve unit plus order/payment/attempt. Consume and release are raced, not failed inside a second delivery trigger. That split was accepted in round 1 and is not reopened.
- `awaitBlockedOnSnapshot` uses a 400ms liveness check rather than `lock_timeout` on the admin session. Luna’s green run means those three calls were still in flight at 400ms and completed after the snapshot commit.

## Validation

Recorded from Luna, not re-run by this lane. Full suite was not run. This is local focused evidence, not remote CI.

```text
mvn -q "-Dtest=Dsp006ConcurrencyTest" test
```

Luna result: exit 0.

`git diff --check origin/integration/storecore-int...HEAD` exited 0.

## Conclusion

P0 scope gates still pass and production `src/main` is untouched. The round 1 matrix gaps are now in `Dsp006ConcurrencyTest`, and the TASK-DSP-005 description matches PR #89 / `bdd1c92`. SCOPE is APPROVED for round 2. This review does not merge, does not approve the GitHub PR, does not run `/sdd.finish`, and does not treat CI as green.
