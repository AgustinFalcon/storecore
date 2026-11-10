# Implementation summary

## Domain and persistence

- Closed Kotlin command, state, rejection, request-error and lookup types with fail-closed translators.
- V16 append-only `inventory_adjustment_commands` receipts protected against mutation.
- Transactional full-snapshot CAS around available, reserved and safety quantities.
- Atomic available-balance update, deterministic ledger event, audit event and receipt.
- Exact replay and non-disclosing idempotency conflict behavior.
- Literal-null validation prevents malformed persisted snapshot fields from normalizing into terminal rejection receipts.

## HTTP and authorization

- USER-only POST and GET contracts with live actor authority, same-origin, CSRF and capability controls.
- Business rejections remain durable outcomes; malformed or future values never become success.
- Existing-variant catalog writes reject stock fields.

## Frontend

- Framework-independent closed phase/outcome/rejection types and one translator per boundary.
- Dedicated command, repository, use case, store and single-responsibility flow steps.
- Authentication-epoch binding and write-ahead recovery journal.
- Responsive, keyboard-operable dialog with explicit review, confirmation and recovery states.

## Validation

- Backend full suite: 290 passing.
- Frontend full suite: 173 files / 1,165 passing plus production build.
- Mock browser: 5/5 responsive/accessibility scenarios.
- Real browser: 22/22 with PostgreSQL 16, including replay, response loss, conflicts and authority loss.
- GitHub candidate CI: run `42879363994`, 3/3 successful.
