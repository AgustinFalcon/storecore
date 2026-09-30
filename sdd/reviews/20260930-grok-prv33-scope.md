VERDICT: APPROVED

# Grok 4.7 — TASK-DSP-007 scope

**Lane:** SCOPE
**PR:** none. `gh pr list --head feature/dsp007-observability` returned `[]`. This note does not approve GitHub, does not call CI green, and does not authorize `/sdd.finish`.
**Branch:** `feature/dsp007-observability`
**SHA reviewed:** `f1b09a6d710cdd3a909579de159752a25b7b2e27`
**Base:** `bae7c6e78fb33ca55298b1833eba09893930d216` (`origin/integration/storecore-int`). `git merge-base --is-ancestor bae7c6e HEAD` exit 0.
**Reviewed diff:** `git diff origin/integration/storecore-int...HEAD`. 10 files, +301 / −6. `git diff --check` exit 0.
**No merge. No push.**

`f1b09a6` records local projection outcomes. It does not deliver them.

## What was read

1. SDD why: `sdd/wip/20260924-ml-desired-stock-projection/meta.md` (local `STOCK_DESIRED_CHANGED` with delivery `PENDING`; no Mercado Libre send, no credentials, no `SENT` / `FAILED` / `DEAD`). `1-functional/spec.md` BR-DSP-06. `2-technical/spec.md` observability paragraph and the rule that this WIP has no claim query and no delivery mutation. `3-tasks/tasks.json` TASK-DSP-007 acceptance. `4-implementation/progress.md`. `sdd/STATUS.md` on this tip.
2. Full `git diff origin/integration/storecore-int...HEAD` and `--name-only`.
3. `DesiredStockProjectionUseCase`, `DesiredStockProjectionObserver`, `LoggingDesiredStockProjectionObserver`, `JdbcDesiredStockPendingStats`, `Dsp007ObservabilityTest`, `docs/agent/ml-desired-stock-local-intent.md`. `ChannelOutboxKind` / `OutboxDeliveryStatus` were read only; they are not in the diff. `StockDesiredChanged.wire` is `STOCK_DESIRED_CHANGED`.

## SDD why

TASK-DSP-007 may add redacted logs and metrics for `PROJECTED`, `UNCHANGED`, `WITHHELD`, and `NO_LISTING`, plus documentation that `PENDING` is not remote delivery. It may add a logging observer, a pending-stats `SELECT`, docs, and a test. It must not add a dispatcher.

P0 NO-GO for this lane: a dispatcher or a transition to `SENT`, live Mercado Libre, Flyway V19, a claim that CI is green, a notify rewrite, or an `INSERT(variant_id)` grant.

## Diff judged

| Path | Role |
| --- | --- |
| `DesiredStockProjectionObserver` | Port. `NoOp` default. |
| `DesiredStockProjectionUseCase` | After the existing upsert loop, `observer.record(results)` inside the caller transaction. Results are unchanged. Empty input still returns before the observer. |
| `LoggingDesiredStockProjectionObserver` | In-memory count by `outcome.wire`. Log fields: outcome, listing id, projection version, `remote_delivery=false`. |
| `JdbcDesiredStockPendingStats` | Three `SELECT`s: withheld snapshot count, `PENDING` delivery count for `STOCK_DESIRED_CHANGED`, oldest `PENDING` age. No `UPDATE`, `INSERT`, `DELETE`, or `FOR UPDATE`. |
| `Dsp007ObservabilityTest` | PG16 fixture. Asserts the four outcomes, pending stats, `SENT` count 0, BlackStore `DISABLED`, and that the recorded line has no oauth ref, token, admin email, or payload. |
| Docs / STATUS / tasks / CHANGELOG | 007 stays `in_progress` on this branch. 006 is recorded as merged at `#90` / `bae7c6e`. DAG text is 10/14 done until 007 merges. |

No path under `backend/src/main/resources/db/migration/`. No notify, inbox, BlackStore, or HTTP client file.

## P0 bar

| Bar | `f1b09a6` |
| --- | --- |
| Dispatcher or `SENT` | Absent. The only new `SENT` line is the test asserting count 0. Docs say PENDING is not advanced to SENT. The observer does not write `channel_outbox_delivery`. |
| Live ML | Absent. The test enables `MARKETPLACE_ML` in Testcontainers and restores it. `oauth_secret_reference` is the fixture `ref:dsp007`. No network client and no live credential. |
| Flyway V19 | Absent. No migration in the compare. |
| Claimed CI green | Absent. STATUS, CHANGELOG, and progress do not call a Verify run green. |
| Notify rewrite | Absent. No notification file in the compare. |
| `INSERT(variant_id)` grant | Absent. No `GRANT`. The test inserts variants as the container owner. STATUS still says runtime `INSERT(variant_id)=false`; that sentence is not edited here. |

## Validation

Luna: `Dsp007ObservabilityTest` exit 0. Recorded for this lane. This review did not re-run that class and did not run the full suite. Local evidence only. Not CI green.

## Gaps

None that change this verdict.

The pending `SELECT` filters `projection_state='WITHHELD'` and `d.status='PENDING'` as SQL literals. Kind is bound through `ChannelOutboxKind.StockDesiredChanged.wire`. Age is one oldest value for that kind, not a series per `projection_version`. That matches the task acceptance and the new doc. It is not a claim query. The test rebuilds the log line in the recording wrapper; the production logger itself only emits outcome, listing id, version, and `remote_delivery=false`.
