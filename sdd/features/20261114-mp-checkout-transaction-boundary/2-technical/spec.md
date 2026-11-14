# Technical specification

## Defect

`CartController.checkout` currently invokes `JdbcCartService.checkout` inside
`IdentityMutationCoordinator.execute`. The coordinator owns a REQUIRED
transaction. `JdbcCartService` creates the local order and then calls
`MpCheckoutAttemptService.startForLocalOrder`; the nested transaction templates
join the outer transaction. Consequently the remote `POST /v1/orders` runs
while the local order, attempt and locks are uncommitted.

## Design

The existing objects remain the flow steps and keep one responsibility:

1. `IdentityMutationCoordinator` validates/locks identity, executes the local
   checkout mutation and rotates CSRF atomically.
2. `JdbcCartService.checkout` performs only the local commerce mutation or
   idempotent replay. It never calls an outbound adapter.
3. After step 1 returns (and its transaction has committed), a dedicated
   post-commit attachment step asks `JdbcCartService.attachRemoteCheckout` to
   enrich the receipt. That step is fail-soft: capability denial, adapter
   absence, preparation failure or binding failure returns the committed local
   receipt with the already-rotated `nextCsrf`. A capability denial happens
   before any remote port invocation.
4. `MpCheckoutAttemptService` commits attempt preparation and `POSTING` before
   invoking `OfficialOrderCommandPort.create`, then binds the result in a new
   transaction. A pure, closed decision over persisted
   `CheckoutAttemptState` selects exactly one action: return an allowlisted
   URL, retry `CREATED`/`POSTING` using that row's stored idempotency key,
   require recovery without POST for `RECOVERY_REQUIRED`, create a new attempt
   only after a verified terminal-unpaid/superseded state, or block for every
   other/unknown state. It never supplies a fresh UUID while an active attempt
   exists.
5. Remote outcomes are monotonic: a late failure may mark only
   `CREATED`/`POSTING`/`RECOVERY_REQUIRED` as requiring recovery. It cannot
   overwrite `READY_FOR_REDIRECT` or `AWAITING_RESULT` persisted by a concurrent
   successful response using the same idempotency key.

The remote step keeps the current fail-soft response behavior: an adapter or
capability exception does not roll back the local order and does not discard
the rotated CSRF token. The durable attempt remains recoverable and a retry of
a crashed `POSTING` create calls the port again with its persisted idempotency
key. `RECOVERY_REQUIRED` is not blindly posted again.

## Verification

Extend the PostgreSQL HTTP integration test fake to observe, from a separate
connection, whether the local order/attempt are committed when `create` runs,
and whether Spring reports an active transaction. Add a remote-crash/retry case
that proves the second invocation actually reaches the command port with the
same key and binds the same single attempt. Add a post-commit attachment test
where capability denial calls no remote port and preserves both local receipt
and `nextCsrf`. Add a deterministic concurrent create race in which success is
bound before a late timeout; the persisted result must remain redirect-ready.

Required gates: backend suite, frontend verify (contract regression), two
independent code reviews on exact head, hosted Verify, merge and post-merge
Verify. No live Mercado Pago call is permitted.
