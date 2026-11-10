# Functional specification

## Goal

An authorized USER administrator or operator can adjust the available quantity of one existing WEB variant without overwriting a concurrent reservation, sale, release or another administrator's decision.

## Inventory language

- `available` is already net of active reservations.
- `reserved` is shown for context and never edited by this command.
- `safety` is shown for context and never edited by this command.
- `onHand = available + reserved` and `saleable = max(available - safety, 0)` are previews, not independent inputs.
- The UI never calls this command a physical count, condition, Outlet stock or external-channel synchronization.

## Journey

1. From `/user/inventory`, an authorized actor opens **Ajustar disponible** for a row whose balance is known and fresh.
2. The edit step shows product, variant, SKU, WEB scope and the current available/reserved/safety values.
3. The actor enters a signed integer delta and a trimmed reason of 1–500 characters.
4. Review shows the frozen intent and before/after available, on-hand and saleable values. It offers **Volver a editar** and **Confirmar ajuste**.
5. Confirmation sends exactly one frozen command. Double click, repeated Enter and alternative activation paths do not create a second logical command.
6. An applied receipt shows the command identifier, recorded time and balances at application. The list is refreshed separately; failure to refresh does not erase or downgrade the confirmed receipt.
7. A balance conflict shows reviewed values next to current authoritative values. It requires a fresh review and a new command identifier; it never silently updates the precondition.
8. Timeout, disconnect, 5xx, malformed response or mismatched receipt identity becomes `OutcomeUnknown`: the command may have applied. The exact UUID and payload remain frozen and all new adjustment transmissions are blocked until recovery in this bounded single-attempt cut.
9. **Comprobar resultado** reads the durable receipt. `NOT_FOUND` preserves uncertainty. After recovering session/CSRF, an exact replay may reuse the same UUID and body; changed intent always uses a new UUID.

## Closed states

Frontend phases are a closed type: `Closed`, `Editing`, `Reviewing`, `Submitting`, `Applied`, `Rejected`, `Conflict`, `OutcomeUnknown`, `Recovering`, `AccessDenied`, `Unknown`. Labels and transition rules live in that type; the view does not compare strings.

Backend receipt outcome is closed: `Applied`, `Rejected(reason)`, `Unknown`. Durable rejection reason is closed: `BalanceChanged`, `BalanceMissing`, `WouldMakeAvailableNegative`, `QuantityOverflow`, `Unknown`. Request-level error is a separate closed type: `InvalidCommand`, `IdempotencyConflict`, `Unknown`; request errors never create or replace a receipt.

Every wire/persistence boundary has one translator; future or malformed values become `Unknown` and never success.

## Authorization and continuity

- POST requires a live USER ADMIN/OPERATOR, same origin, valid CSRF and `MANUAL_FULFILLMENT/MANAGE` ACTIVE.
- GET receipt requires the original actor, a live USER session and `MANUAL_FULFILLMENT/READ`; it does not grant another write.
- Logout, actor change, authority loss or authentication-epoch change invalidates drafts and stale callbacks. A login by the same user is still a new epoch.
- CSRF rotation alone does not destroy a recoverable frozen attempt.
- Closing during submission or uncertainty hides the panel but preserves a visible recovery entry; it does not claim cancellation.
- The bounded journal holds one global unresolved attempt. While it is submitting or uncertain, no variant can start another adjustment. The frozen journal must persist successfully before POST; storage failure blocks transmission with an actionable error.

## Validation and accessibility

- Delta is an exact signed Int32, non-zero; no `parseInt`, rounding, clamping, exponent or numeric-string coercion.
- The proposed available quantity must remain within Int32 and non-negative.
- Missing/unknown balance never becomes zero and cannot open the command.
- Dialog/panel has an accessible name and description, stable initial focus, contained keyboard navigation, step-heading focus, linked errors and restored focus after close.
- Invalid submission focuses the first invalid field. Applied uses status; conflict and unknown outcome use alert.
- Reflow is usable at 320/390/768/1440 px and 200% text/zoom; controls are at least 44 px and do not rely on color.

## Acceptance

- Two commands with the same expected snapshot cannot both apply after an intervening balance change.
- Exact replay returns the original immutable receipt and produces one balance change, ledger and audit event.
- A durable rejection cannot later apply on replay.
- Catalog PUT cannot mutate stock for an existing variant.
- The UI distinguishes receipt-at-application from the current refreshed balance.
- A terminal receipt is accepted only when both returned `commandId` and `variantId` equal the frozen attempt; mismatch remains OutcomeUnknown and preserves the journal.
- Browser tests cover keyboard, focus, reflow, double submit, conflict, unknown outcome, recovery and authorization loss.
