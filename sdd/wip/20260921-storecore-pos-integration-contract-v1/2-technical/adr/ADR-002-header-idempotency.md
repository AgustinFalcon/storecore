# ADR-002 — Cuádruple de headers, una fila, sin REJECTED

**Status:** proposed for Sol · **Fecha:** 2026-09-21

## Decision

Identidad wire: `(client_instance_id, device_id, sale_id, operation_id)`. Reserve/commit/release/GET comparten `X-Operation-Id`.

PENDING durable existe sólo después de Tx-A (`request_hash` canónico COMMIT). `receipt` null **iff** `state=PENDING`.

Matriz 409/422:

- `INSUFFICIENT_STOCK` / `CATALOG_VERSION_STALE` / `VALIDATION`: DELETE claim; GET 404; nuevo `X-Operation-Id`.
- `CONFLICT`: rollback mutación; conserva estado durable **previo** (PENDING en reserve; RESERVED/COMMITTED en commit/release); misma cuádruple.
- `IDEMPOTENCY_PAYLOAD_MISMATCH`: conserva original; GET original; corrección = nuevo ID.
- `EXPIRED`: conserva EXPIRED; GET EXPIRED; nueva venta = nuevo ID.

Sin estado `REJECTED`. Tras HTTP perdida: GET primero.

## Consequences

GET 404 significa nunca persistida, claim borrado en Tx-B, o saga nunca existió. GET 410 OPERATION_RETIRED significa tombstone (saga purgada; nunca re-POST). GET 200 PENDING significa retomar Tx-B.

## Rejected

`operation_kind` en la identidad StoreCore. Estado `REJECTED`. Una sola transacción PENDING+reserve (invisible a GET).
