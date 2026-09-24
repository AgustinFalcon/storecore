VERDICT: APPROVED (Testcontainers CAS temporary ACTIVE; not live)

# L3-001 — Concurrent saga, expiry, commit/release, crash/retry

**Scope:** Isolated engine + HTTP matrix under Sol `20260923-sol-pos-next-go.md`. Not companion live.

## Evidence

- `BlackStoreSagaEngineTest` concurrent identical quadruple: one receipt, reserved qty once.
- Commit vs expire exclusive: terminal is COMMITTED or EXPIRED, reserved returns to 0.
- GET after Tx-A sees PENDING; tombstone GET/POST is 410 `OPERATION_RETIRED` `retryable=false`.
- Stock/stale delete claim (GET 404). Reserve mismatch keeps PENDING. Live terminal incompatible command is 409 `OPERATION_STATE_CONFLICT`.
- Purge is INSERT tombstone (`retention_until >= retired_at + 7 years`) then DELETE lines then DELETE saga.
- `BlackStoreHttpContractTest` CAS temporary ACTIVE: catalog/stock 200, ETag 304 (quoted/weak), reserve 200, GET 200, commit 200, 409 `OPERATION_STATE_CONFLICT`, GET 404 missing, 410 after purge, concurrent HTTP reserve one 200, baseline 403 after restore DISABLED.

## Residual

Not live identity, network, or real companion. PIC-009 ML outbox still returns false.
