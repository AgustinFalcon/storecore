VERDICT: APPROVED (isolated fail-closed)

# L3-001 — Concurrent saga, expiry, commit/release, crash/retry

**Scope:** PIC-001..009 fail-closed. Isolated `JdbcBlackStoreSagaEngine` + HTTP deny-first. Not live. Not PIC-010.

## Evidence

- `BlackStoreSagaEngineTest` concurrent identical quadruple: one receipt, reserved qty once.
- Commit vs expire exclusive: terminal is COMMITTED or EXPIRED, reserved returns to 0.
- GET after Tx-A sees PENDING; tombstone GET/POST is 410 `OPERATION_RETIRED` `retryable=false`.
- Stock/stale delete claim (GET 404). Reserve mismatch keeps PENDING. Live terminal incompatible command is 409 `OPERATION_STATE_CONFLICT`.
- Purge is INSERT tombstone (`retention_until >= retired_at + 7 years`) then DELETE lines then DELETE saga.
- HTTP operational routes stay 403 `CAPABILITY_DISABLED` via `BlackStoreIntegrationService.requireEnabled`. Facade unit test proves limiter/catalog/saga are not called while disabled.

## Residual

HTTP 200 saga paths are not Testcontainers-proven because Sol forbids activating `BLACKSTORE_INTEGRATION`. Facade enabled-double is a local port fake, not a module flip.
