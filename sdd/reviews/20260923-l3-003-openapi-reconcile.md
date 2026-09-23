VERDICT: APPROVED (isolated fail-closed)

# L3-003 — OpenAPI compatibility and reconcile semantics

**Scope:** PIC-001..009 fail-closed. Canonical YAML only. Not PIC-010.

## Evidence

- `GET /blackstore-integration/v1/openapi.yaml` returns 200, `1.0.0-draft`, `OperationRetired`, header `X-Contract-Version`.
- StoreCore WIP YAML remains the only contract YAML. BlackStore pointer stays Markdown.
- Isolated reconcile is intersection of caller `knownReceipts` (max 500); unknown receipts listed; zero ledger/stock/saga writes in the read-only test.
- Tombstone receipts are unknown to reconcile and do not authorize re-POST (410 on GET/reserve).
- Path prefix is `/blackstore-integration/v1`.

## Residual

HTTP reconcile stays 403 while DISABLED. Isolated engine is the proof of read-only semantics.
