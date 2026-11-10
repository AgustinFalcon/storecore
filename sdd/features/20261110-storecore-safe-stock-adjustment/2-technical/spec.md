# Technical specification

## HTTP contract

`POST /api/v1/user/inventory/{variantId}/adjustments`

```json
{
  "commandId": "UUID",
  "quantityDelta": -2,
  "expected": {"available": 8, "reserved": 3, "safety": 1},
  "reason": "Corrección por conteo físico"
}
```

`GET /api/v1/user/inventory/{variantId}/adjustments/{commandId}` returns the immutable receipt for the original actor or a closed `NOT_FOUND` result. `NOT_FOUND` never proves that an in-flight write did not commit.

All bodies use the existing `BaseResponse` envelope. Exact wire values are uppercase.

- POST `200`: `state=APPLIED`, with `commandId`, `variantId`, before/after full snapshots, `ledgerId` and `recordedAt`.
- POST `409`: `state=REJECTED`, `reason=BALANCE_CHANGED|BALANCE_MISSING`, immutable receipt identity and the observed snapshot when safe.
- POST `422`: `state=REJECTED`, `reason=WOULD_MAKE_AVAILABLE_NEGATIVE|QUANTITY_OVERFLOW`, immutable receipt identity.
- POST `400`: request-level `error=INVALID_COMMAND`; no new receipt.
- POST `409`: request-level `error=IDEMPOTENCY_CONFLICT`; no new receipt and no replacement or disclosure of the existing receipt.
- GET `200`: `lookup=FOUND` plus receipt, or `lookup=NOT_FOUND`. A receipt belonging to another actor is indistinguishable from `NOT_FOUND`.

The four business rejections are persisted and committed as normal transaction results, including CSRF rotation; HTTP status mapping occurs after the transaction and must not throw through `IdentityMutationCoordinator`. Responses use `Cache-Control: no-store`. Unknown or malformed discriminators remain uncertain, never terminal success/failure.

## Persistence and transaction

Add the next forward-only migration with append-only `inventory_adjustment_commands`: global UUID, actor, variant, canonical request hash/content, closed state/reason, before/after JSON or columns, ledger reference and timestamp. Protect confirmed rows against update/delete and grant least required runtime privileges.

Mutation sequence:

1. Authenticate USER ADMIN/OPERATOR, origin and request shape.
2. Enter `IdentityMutationCoordinator` so CSRF validation, effect and rotation commit together.
3. Lock live actor authority and evaluate `MANUAL_FULFILLMENT/MANAGE`.
4. Serialize by UUID using a transaction advisory lock; an exact existing actor/variant/payload returns its original receipt before re-evaluating balance.
5. A mismatched UUID reuse returns `IdempotencyConflict` without leaking another actor's receipt.
6. Lock the existing balance row with `FOR UPDATE`; missing becomes a durable `BALANCE_MISSING` receipt and is never auto-created.
7. Compare expected `available`, `reserved` and `safety`. Evaluate delta in Long; persist changed, negative or overflow outcomes as durable rejected receipts without throwing away the transaction.
8. For Applied, update only available, append one `ADJUSTMENT/INTERNAL` ledger row with a deterministic unique key, append one `INVENTORY_ADJUSTED` audit row and persist the receipt atomically.
9. Translate the domain result to HTTP outside domain logic.

The full snapshot precondition detects a reservation/consumption that leaves available unchanged, but does not claim to detect historical ABA cycles that end at the same snapshot.

## Catalog bypass closure

For existing variants, catalog PUT rejects `availableQuantity` and `stockAdjustmentReason`; it cannot call `setAvailableQuantity`. Creation/import initialization remains a separate contract and is not expanded here. The Angular catalog writer continues omitting stock fields.

## Frontend design

- Keep `UserInventoryStore` responsible only for reads.
- Add an immutable `AdjustAvailableStockCommand`, a dedicated repository/use case and a dedicated adjustment store.
- Model phases, outcome and rejection reasons as framework-free closed classes with private constructors and one `fromWire` per wire type.
- Model edit, review, confirm and recover as step objects with one responsibility each.
- Freeze UUID and serialized payload before POST. Transition synchronously to Submitting.
- Persist exactly one global unresolved attempt in a versioned session journal bound to authentication epoch, actor and variant. Successful persistence is a precondition to POST; unavailable/full storage blocks transmission. While the attempt is submitting or uncertain, every variant's adjustment CTA is blocked until recovery. Translate journal input through one boundary and never treat it as authority.
- Each callback verifies authentication epoch and local attempt identity. Applied or terminal Rejected is published only if the response `commandId` and `variantId` both equal the frozen request; mismatch enters OutcomeUnknown, preserves the journal and blocks a new UUID.
- Conflict keeps delta/reason visible but requires fresh authoritative read, review and a new UUID. OutcomeUnknown keeps the original UUID/body and forbids silent retry with changed preconditions.

## Tests

Backend PostgreSQL/HTTP tests cover exact replay, UUID mismatch, two concurrent deltas, reservation/consume/release/RMA races, response loss, durable rejection, injected rollback, absent balance, overflow/negative/fraction/string input, actor/capability/CSRF/origin failures, clean/upgrade migration and catalog bypass rejection.

Frontend unit tests cover every closed type and translator, exact number parsing, steps, actor epoch, stale callbacks, journal validation, double submit, conflict and recovery. They include A-uncertain → hide → attempt B blocked, reload recovery, unavailable/full storage, mismatched command receipt and mismatched variant receipt. HTTP tests assert frozen payload and no catalog stock fields. Browser tests cover the full keyboard/focus/reflow/axe journey and Real E2E proves balance, ledger, audit and exact replay with one effect.

## Non-goals

No external channel writer, Mercado Libre sync, BlackStore sync, physical inventory count, adjustment history screen, creation of missing balances, bulk adjustment, deploy or homologation.
