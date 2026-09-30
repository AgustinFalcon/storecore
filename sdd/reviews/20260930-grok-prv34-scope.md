VERDICT: APPROVED

# Grok 4.7 — TASK-DSP-008 scope

**Lane:** SCOPE
**PR:** none. `gh pr list --head feature/dsp008-upgrade-coexistence` returned `[]`. This note does not approve GitHub, does not call CI green, and does not authorize `/sdd.finish`.
**Branch:** `feature/dsp008-upgrade-coexistence`
**SHA reviewed:** `bb62d3dc22dbdb15025f55a4c946bc8550fa99bb`
**Base:** `0f8b65396592c480c56116cdddd50b3a28d11bc5` (`origin/integration/storecore-int`). `git merge-base` is that SHA. One commit: `bb62d3d` (`TASK-DSP-008: prove Flyway V18 ceiling and LISTING_STOCK coexistence.`).
**Reviewed diff:** `git diff origin/integration/storecore-int...HEAD`. 5 files, +224 / −6. `git diff --check` exit 0. `git diff origin/integration/storecore-int...HEAD -- backend/src/main` is empty.
**No merge. No push. No deploy.**

## What was read

1. TASK-DSP-008 in `sdd/wip/20260924-ml-desired-stock-projection/3-tasks/tasks.json` (acceptance, `in_progress`, `stats.done` still 11). SDD why: `meta.md`, `1-functional/spec.md` BR-DSP-08, BR-DSP-10, AC-DSP-09, AC-DSP-10, `2-technical/spec.md` (listing snapshot keeps `variant_id` without a composite FK to the mutable mapping; backfill/`UPGRADE_QUARANTINE` is the next legal migration), `4-implementation/progress.md`, `sdd/STATUS.md`.
2. Full `git diff origin/integration/storecore-int...HEAD`.
3. `Dsp008UpgradeCoexistenceTest`. On-disk migrations stop at `V18__dsp003_stock_desired_changed_outbox.sql`. That V18 file is not in the diff; its CHECK is `(kind <> 'STOCK_DESIRED_CHANGED' AND projection_version IS NULL) OR (kind = 'STOCK_DESIRED_CHANGED' AND listing_id IS NOT NULL AND projection_version IS NOT NULL AND projection_version > 0)`.

## SDD why

TASK-DSP-008 demonstrates the controlled base after 000/000A: historic `LISTING_STOCK` stays immutable beside versioned `STOCK_DESIRED_CHANGED`, an ACTIVE listing with `desired_quantity=0` and a positive balance stays withheld until reactivation, remap keeps the prior snapshot, and the CHECK rejects `STOCK_DESIRED_CHANGED` with `projection_version` NULL. BlackStore stays disabled. The effective Flyway ceiling and the next free version are documented. This slice is tests plus those docs. It does not add a migration file.

P0 NO-GO for this lane: a dispatcher or `SENT`, live Mercado Libre or network, a Flyway V19 file, a BlackStore caller, an `INSERT(variant_id)` grant, a claim that CI is green, or a `backend/src/main` production rewrite.

## Diff judged

| Path | Role |
| --- | --- |
| `backend/src/test/kotlin/com/storecore/commerce/Dsp008UpgradeCoexistenceTest.kt` | PG16 Testcontainers. Asserts a `V18__` file, no `V19__` file, Flyway history contains `18`, and `BLACKSTORE_INTEGRATION=DISABLED`. Seeds one historic `LISTING_STOCK`. Projects an ACTIVE `desired_quantity=0` listing with available 8 to `WITHHELD` and zero `STOCK_DESIRED_CHANGED`. Activate emits one. Remap keeps snapshot `variant_id` on the first SKU. ConfirmMapping emits a second. Historic jsonb is unchanged and the `LISTING_STOCK` count stays 1. A NULL `projection_version` insert throws `DataIntegrityViolationException`. |
| `sdd/STATUS.md` | Integration head recorded as `0f8b653` / #91. 008 stays on `feature/dsp008-upgrade-coexistence`. Ceiling **V18**; next free **V19** (no file). DAG 11/14 done until 008 merges. Bridge stays fail-closed. |
| `tasks.json` | 007 description records merge #91 / `0f8b653`. 008 moves `pending` → `in_progress`. Acceptance text unchanged. `stats.done` stays 11. |
| `progress.md` | Ceiling V18; next free V19 without a migration. No dispatcher, network, secrets, or `sdd.finish`. |
| `CHANGELOG.md` | 007 gains the #91 link. 008 names coexistence, ceiling V18, free V19, and no BlackStore caller. No PR number and no CI claim for 008. |

No path under `backend/src/main/`. No file under `db/migration/`. No BlackStore source, HTTP client, notify, or inbox worker. Directory listing is V1–V18 plus the later V8–V16 names; no `V19__`.

## P0 bar

| Bar | `bb62d3d` |
| --- | --- |
| Dispatcher / `SENT` | Absent. No `InboxApplicationWorker` path. Progress still refuses a dispatcher. The test never writes `SENT`. |
| Live ML / network | Absent. The test toggles `MARKETPLACE_ML` inside Testcontainers and restores `DISABLED` in `finally`. `oauth_secret_reference` is the fixture label `ref:dsp008`. Container image is `postgres:16-alpine`. No HTTP client. |
| Flyway V19 file | Absent. The test asserts `versions.none { it.startsWith("V19__") }`. |
| BlackStore caller | Absent. No BlackStore file in the compare. Both tests assert `BLACKSTORE_INTEGRATION=DISABLED`. The `LISTING_STOCK` insert is the historic fixture inside the test; the count stays 1. |
| `INSERT(variant_id)` grant | Absent. No `GRANT` in the compare. Variant and balance inserts are fixture DML on the container database. |
| Claimed CI green | Absent. STATUS, CHANGELOG, and progress do not call a Verify run green. The older login note that hosted Verify had `steps=[]` stays a failure record. |
| `src/main` production rewrite | Absent. `git diff -- backend/src/main` is empty. |
| `/sdd.finish` | Absent. 008 stays `in_progress`. The WIP stays under `sdd/wip/`. Progress names `sdd.finish` only to refuse it. |

## Validation

Luna recorded `Dsp008UpgradeCoexistenceTest` exit 0 for this lane. The full suite was not run. This lane's own check is `git diff --check origin/integration/storecore-int...HEAD`, exit 0. Local evidence only. Not CI green.

## Gaps

None that change this verdict.

The quarantine in the test is the existing projector on a database already migrated through V18, after the test inserts the legacy-shaped listing. It is not a new backfill migration. The technical spec still describes `UPGRADE_CLASSIFICATION_REQUIRED` / `UPGRADE_QUARANTINE` as that next legal migration; this compare leaves it unfiled at V19. The test does not query `channel_outbox_delivery.status`, `desired_quantity` after Activate, or `audit_events`. The account `purpose` flip is a fixture `UPDATE`. `ConfirmMapping` is the audited lifecycle step in the unchanged use case. Task status stays `in_progress`, so those columns are not claimed as a closed migration. `src/main` stays untouched.
