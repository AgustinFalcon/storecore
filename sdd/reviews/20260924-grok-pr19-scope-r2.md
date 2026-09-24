VERDICT: APPROVED

# Grok 4.7 — PR #19 scope / implementation r2

**Lane:** SCOPE / implementation
**PR:** https://github.com/AgustinFalcon/storecore/pull/19
**Title:** StoreCore local PIC-009 outbox and UX-ANG on existing routes
**GitHub base:** `master` (`baseRefName=master`)
**Branch:** `feature/pos-pic-001-009-fail-closed` @ `e29d3ae` (`Align POS and UX status with the local fail-closed evidence.`)
**Reviewed diff:** `origin/master...HEAD` (`e73bf4c...e29d3ae`), six commits, 168 files, +14918 / −416
**Prior:** `sdd/reviews/20260924-grok-pr19-sdd.md` (`CHANGES_REQUIRED` at `94588df`, GitHub base was not `master`)
**No merge.** This file does not approve GitHub, does not call CI green, and does not authorize `/sdd.finish`.

## What was read

1. `gh pr view 19` (title, body, `baseRefName`, head, commits). Base is `master`. Head includes `e29d3ae`.
2. `sdd/reviews/20260924-grok-pr19-sdd.md` (r1 `CHANGES_REQUIRED`).
3. `sdd/reviews/20260923-sol-remaining-gates.md`.
4. Full `git diff --name-only origin/master...HEAD`, then the outbox adapter, V7, saga commit/release, capability `decide`, fail-closed and CAS tests, companion store, and `frontend/src/app/app.routes.ts`.

`e29d3ae` changes only SDD status text (`STATUS.md`, `TRACEABILITY.md`, POS/UX meta, tasks, progress) plus the r1 review file. It does not add Kotlin, Flyway, or Angular routes.

## Validations

From `backend/` on 2026-09-24, local Testcontainers (PostgreSQL 16, Flyway V1–V7). Surefire reports under `backend/target/surefire-reports/`.

`mvn -q "-Dtest=BlackStoreFailClosedHttpTest,BlackStoreHttpContractTest,BlackStoreIntegrationServiceTest,BlackStoreSchemaMigrationTest" test`

Exit 0. Local focused run. Not CI green.

| Suite | Result |
| --- | --- |
| `BlackStoreFailClosedHttpTest` | 2/2, 0 failures |
| `BlackStoreHttpContractTest` | 2/2, 0 failures |
| `BlackStoreIntegrationServiceTest` | 2/2, 0 failures |
| `BlackStoreSchemaMigrationTest` | 3/3, 0 failures |

GitHub Verify run `35953001420` (`pull_request`, head `e29d3ae`) concluded **failure**. `backend` started `2026-09-24T03:48:46Z` and completed `2026-09-24T03:48:49Z`. `frontend` started `2026-09-24T03:48:46Z` and completed `2026-09-24T03:48:48Z`. Both jobs have `steps: []`. They did not execute a test suite. That is not a green check and it is not evidence the suite failed in CI.

## Scope checks

| Check | Result |
| --- | --- |
| Local `channel_outbox` only | PASS. `JdbcBlackStoreMlListingAdapter` updates `channel_listings.desired_quantity` from local `inventory_balances` and inserts `channel_outbox` `LISTING_STOCK` with `ON CONFLICT (idempotency_key) DO NOTHING`. No `channel_outbox_delivery` write, no Mercado Libre HTTP client, no SDK, no webhook. The blackstore package has no `http://` / `https://` client. |
| Module `DISABLED` outside the CAS test | PASS. V7 flips `future_optional` to false and raises if any `BLACKSTORE_INTEGRATION` row is not `DISABLED`. Fail-closed HTTP stays 403 `CAPABILITY_DISABLED`, workers return 0, `enqueueDesiredQuantityAfterBlackStore("any")` is false, and `LISTING_STOCK` count is 0. `BlackStoreHttpContractTest` is the temporary CAS: `changeState(ACTIVE)` inside the test, one outbox row and `desired_quantity=5` after commit, zero `inventory_ledger` rows for `MERCADO_LIBRE`, then `changeState(DISABLED)` in `finally`. `BlackStoreSchemaMigrationTest` also calls `changeState(ACTIVE)` and restores `DISABLED` before it asserts. No startup path seeds `ACTIVE`. |
| UX-ANG existing routes only | PASS. `frontend/src/app/app.routes.ts` is not in the 168-path diff. Frontend edits are existing P/C/U views, shared chrome, `index.html` (Inter), and `styles.scss` tokens. No new route file, no payment SDK, no `package.json` change. |
| No `EffectivePrice` | PASS. `EffectivePrice.kt`, `EffectivePriceQueryPort.kt`, and `JdbcEffectivePriceQueryAdapter.kt` are untracked and absent from `origin/master...HEAD`. |
| No `docs/agent` | PASS. `docs/agent/**` is untracked and absent from the diff. |
| No fiscal | PASS. No ARCA/fiscal source, DDL, or worker in the diff. Fiscal remains NO-GO prose in the Sol gate and older reviews. |
| No live | PASS. Companion access is local JDBC. The schema test rejects a companion row with status `ACTIVE`. The HTTP fixture uses `oauth_secret_reference='opaque-ref-test'`. No live host, credential, or delivery attempt. |

`requireEnabled` / `runWhenEnabled` call `CapabilityDecisionPort.decide`. `JdbcCapabilityService.decide` throws `CapabilityDisabled` when state is `DISABLED` before any actor allow-list, and that method only `SELECT`s. The listing adapter returns false on `CapabilityDisabled` before it reads listings or inserts outbox. The service test records limiter, catalog, and saga calls at 0 while the fake decision is disabled, and the enabled double is an in-memory port fake that does not call `changeState`.

## Non-blocking notes

- The fail-closed enqueue call passes `"any"`, which returns before `decide()` because it is not a UUID. The zero-row assertion still holds, and a real UUID hits `decide()` before any insert.
- Outbox insert runs in `commit`/`release` `.also` after `TransactionTemplate.execute` returns. A retry of an already `COMMITTED` operation still reaches `.also`, and the idempotency key blocks a second row. The HTTP test asserts one row after one commit; it does not add a second commit.
- `enqueued` is set true when a listing exists even if `ON CONFLICT DO NOTHING` inserts zero rows.
- `BlackStoreIntegrationService` still imports `JdbcCapabilityService.BLACKSTORE_MODULE` from infrastructure. The decision goes through the port.
- `assertNoLiveTraffic()` counts local rows. The HTTP service does not call it. The name is not a network client.

## Residual NO-GO

Fiscal/ARCA, MP-LIVE-05, live companion, secrets, tag, deploy, publish, and `/sdd.finish` stay unauthorized. Both WIPs stay under `sdd/wip/`. Untracked `EffectivePrice*.kt` and `docs/agent/**` stay out of this PR. This lane does not merge.
