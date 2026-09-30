VERDICT: APPROVED

# Grok 4.7 — PR #v24 scope (POSC-006 / PIC-006A)

**Lane:** SCOPE
**PR:** pending (`feature/posc006a-get-reconcile-ro` → `integration/storecore-int`)
**Title:** Prove GET and reconcile stay read-only through the Spring HTTP adapter
**GitHub base:** `integration/storecore-int` @ `1dbad5d` (POSC-004A merge #81)
**Branch:** `feature/posc006a-get-reconcile-ro` @ `53d48cb` (`Prove GET and reconcile stay read-only through the Spring HTTP adapter.`)
**Reviewed diff:** `git diff origin/integration/storecore-int...53d48cb` (`1dbad5d...53d48cb`), one commit, 6 files, +422 / −7
**No merge.** This file does not approve GitHub, does not call CI green, and does not authorize `/sdd.finish`, POSC-005 wire, fiscal, live connector, or production module activation.

## What was read

1. `sdd/wip/20260927-pos-integration-convergence/3-tasks/plan.md` §PIC-006A — test-only PG16 proxy after POSC-004A; `@Transactional(readOnly, REPEATABLE_READ)` effective on GET/reconcile; full before/after snapshots; GET 404/PENDING/durable/410; reconcile 0/501/500/duplicates; alien/revoked/retired; concurrent writer; no production/Flyway/ACL/pom/config; 400 dirty-duplicates deferred; does not certify commit/release/purge.
2. `sdd/wip/20260927-pos-integration-convergence/3-tasks/posc006-implementation-slices.md` — ownership via existing handlers + `TransactionTemplate readTx` on `JdbcBlackStoreSagaEngine`; Luna Maven record exit 0 / 1 test / V14 / PG16; production diff none.
3. Full `git diff origin/integration/storecore-int...HEAD` at `53d48cb`. Workspace branch matches reviewed SHA. Dirty paths outside the diff were not re-reviewed.
4. `backend/src/test/kotlin/com/storecore/blackstore/Posc006aGetReconcileRoTest.kt` in full.
5. `sdd/STATUS.md`, `tasks.json`, and `4-implementation/progress.md` delta — tracking only; 004A merged, 006 in progress, POSC-005 NO-GO until 006 merge.

## SDD why

POSC-004 merged commit/release/GET/reconcile on V13; POSC-004A merged worker-owned purge (V14). PIC-006A closes the read-only certification gate: prove GET `/operations/{operationId}` and POST `/operations/reconcile` perform zero domain writes through the real Spring HTTP stack. Production already routes both through `readTx` (`TransactionTemplate` REPEATABLE READ + `readOnly=true`) inside `JdbcBlackStoreSagaEngine`; this slice adds PG16 evidence only. Commit/release/purge remain certified by 004/004A; here they appear only as 410 tombstone fixture. POSC-005 wire, fiscal, live BlackStore, ML RR, and `/sdd.finish` stay blocked.

## Diff judged

```text
CHANGELOG.md
backend/src/test/kotlin/com/storecore/blackstore/Posc006aGetReconcileRoTest.kt
sdd/STATUS.md
sdd/wip/20260927-pos-integration-convergence/3-tasks/posc006-implementation-slices.md
sdd/wip/20260927-pos-integration-convergence/3-tasks/tasks.json
sdd/wip/20260927-pos-integration-convergence/4-implementation/progress.md
```

One commit `53d48cb`. **Zero** production Kotlin, Flyway, ACL, `pom.xml`, shared YAML, or frontend paths. Confirmed via `--stat`, `--name-only`, and full diff review.

## Scope checks

| Check | Result |
| --- | --- |
| No production / Flyway / ACL / pom / config diff | PASS. Six paths above only; no `backend/src/main/`, no `db/migration/`, no `.github/`, no OpenAPI publish. |
| `@SpringBootTest` RANDOM_PORT + `TestRestTemplate` | PASS. Line 38–41, 289–324 HTTP helpers hit real `/blackstore-integration/v1/operations/*` and `/operations/reconcile`. |
| `readTx` REPEATABLE_READ + readOnly | PASS. Reflection on wired `JdbcBlackStoreSagaEngine.readTx` (lines 91–94); matches production bean at `1dbad5d` (`isolationLevel = REPEATABLE_READ`, `isReadOnly = true`; used by `get()` / `reconcile()`). Honest deferral of `@Transactional` on service/controller — no production change in this slice. |
| Domain snapshots before/after GET & reconcile | PASS. `domainSnapshot()` (lines 234–257) aggregates ops, lines, tombstones, reservations, ledger, balances (optional), audit, channel outbox+delivery, mp outbox+delivery, payment inbox+processing, ml inbox+processing, integration_outbox; compared before/after each read path. |
| GET 404 NOT_FOUND | PASS. Random UUID → 404 `NOT_FOUND`; snapshot unchanged. |
| GET PENDING 200 | PASS. Engine `claimPending` fixture → 200 `PENDING`; snapshot unchanged. |
| GET durable RESERVED 200 | PASS. HTTP reserve → GET 200 `RESERVED` + receipt; snapshot unchanged. |
| GET 410 OPERATION_RETIRED | PASS. Commit + aged purge fixture → GET 410 `OPERATION_RETIRED`; snapshot unchanged after GET. |
| Reconcile 0 / 501 → 400 VALIDATION | PASS. Empty array and 501 receipts → 400 `VALIDATION`. |
| Reconcile 500 unknown → 200 | PASS. 500 unknown receipts → 200, `present` empty, `unknownReceipts` size 500; snapshot unchanged. |
| Reconcile duplicates accepted/deduplicated | PASS. Duplicate known receipt + one unknown → 200, `present` size 1, unknown list `["unknown-006a-dup"]`; snapshot unchanged. |
| Alien `X-Client-Instance-Id` → 403 FORBIDDEN | PASS. Wrong client header on GET → 403 `FORBIDDEN`; snapshot unchanged. |
| Revoked companion → 401 UNAUTHORIZED before read | PASS. DB `REVOKED` → GET 401 `UNAUTHORIZED`; snapshot unchanged; companion restored for cleanup only. |
| Concurrent `inventory_balances` writer | PASS. Background JDBC updater touches balances; GET snapshot (excluding balances) unchanged; `updated_at` proves writer ran. |
| BLACKSTORE restored DISABLED in `@AfterAll` | PASS. Lines 80–87 assert `DISABLED` in `module_configurations`. |
| Does NOT certify commit/release/purge | PASS. `mutate("commit")` and `worker.purgeTerminal()` are 410 fixture setup only; no acceptance criteria for those mutations. |
| 400 dirty-duplicates NOT asserted | PASS. Correct deferral per baseline vs dirty YAML split. |
| SDD tracking only | PASS. STATUS/slices/tasks/progress/CHANGELOG; no archive, no `/sdd.finish`, no POSC-005 closure. |

## Validations

| Check | Result |
| --- | --- |
| Diff name-only and commit list | PASS, 2026-09-30. Six paths above; merge-base `origin/integration/storecore-int` = `1dbad5d`; one commit `53d48cb`. |
| Maven PG16 (`Posc006aGetReconcileRoTest`) | **Recorded by Luna, exit 0** (1 run, 0 failures, V14, PG16). Not re-run in this review (instruction: do not start Maven). |
| GitHub Verify | **Not CI green.** PR not opened at review time; hosted Verify not claimed. |

## Standards

Test follows established POS harness pattern: Testcontainers PG16, temporary `BLACKSTORE_INTEGRATION` activation, superuser JDBC for fixtures, HTTP envelope assertions via shared helpers. Snapshot JSON aggregation is deterministic (`ORDER BY` keys). Closed-domain error codes asserted (`NOT_FOUND`, `VALIDATION`, `OPERATION_RETIRED`, `FORBIDDEN`, `UNAUTHORIZED`). No frontend or OpenAPI surface change.

## Gaps

No P0 or P1 scope gaps.

P2 (non-blocking): acceptance text mentions “retry/alert” tables — POSC-004A honestly deferred retry/poison inbox (no DDL); test covers channel/mp outbox+delivery and payment/ml inbox+processing instead. `readTx` isolation is asserted via reflection on a private field (brittle but acceptable for test-only slice). Reconcile response ordering among `present` entries is not explicitly pinned.

## Residual NO-GO

POSC-005 wire closure, fiscal/ARCA, ML live/TASK-DSP-000B, production BlackStore companion, runtime `INSERT(variant_id)`, retry/poison inbox, tag, deploy, publish, and `/sdd.finish` stay outside this PR. This verdict is scope only. No merge. No GitHub approve. No CI green. No `/sdd.finish`.
