# Technical specification

## Existing server contract

No backend change is required. The existing endpoint is protected by USER cookie,
same-origin validation, ADMIN authorization and rotating CSRF. It applies a
session-bound PostgreSQL command, checks `expectedConfigVersion`, records the
provided correlation UUID in the immutable audit event and returns the resulting
`{module,state,configVersion}` snapshot.

## Domain and boundaries

- Extend `CapabilityTargetPolicy` to one closed productive policy with separate
  read and mutation decisions: ADMIN reads/writes, OPERATOR reads only, Unknown
  denies both.
- Add closed `CapabilityMutationPhase`: `Idle`, `Editing`, `Saving`, `Confirmed`,
  `Conflict`, `ResultUncertain`, `Rejected`, `Unknown`.
- `CapabilityModuleState` owns `allowedTargets`: the generic database transition
  graph is encoded once in the closed type (`Disabled -> ReadOnly|Active`;
  `ReadOnly|Active|Paused` follow the published V22 graph; `Error -> Paused|Disabled`).
  Same-state and `Unknown` are excluded. Module-specific constraints such as a
  future-optional module remaining disabled stay server-authoritative and surface
  as rejection, never as a guessed frontend rule.
- Add immutable `CapabilityStateIntent` plus a factory/validation step. It owns the
  known module, current/target states, expected version, trimmed reason and UUID.
  The view never assembles wire payload strings.
- Add `ChangeCapabilityStateUseCase`; extend `IUserRepository` with a typed command.
- `UserHttpRepository` is the single wire edge. It URL-encodes the known module,
  serializes state/version/reason/correlation and maps the response through the
  existing capability mapper. It never accepts `Unknown` for a write.

## Store concurrency and actor isolation

- Keep an actor generation separate from a monotonic read request id. `setActor`
  changes the actor generation, clears snapshot/draft/result and invalidates every
  callback from the previous actor. GET refreshes increment only the read request
  id and can never strand or invalidate the write fence.
- The actor key records principal id, known sorted roles and
  `UserSession.authenticationEpoch`. Re-authentication of the same id/roles is a
  new actor generation. Mutation policy is derived from closed roles, not routes.
- `beginEdit` snapshots the current authoritative row. `confirm` captures the
  generation and intent, then uses an exhaust/explicit busy fence so concurrent
  submits cannot start.
- Before dispatch, a session-scoped command journal persists the authentication
  epoch and complete validated intent in `sessionStorage`. It is the authority for
  `Saving`/`ResultUncertain`, not the route component store, so navigation, store
  recreation and page reload cannot reopen writes in the same epoch. The journal
  has one strict `fromWire`; malformed storage fails closed by retaining a lock
  marker, never by enabling mutation.
- Success replaces by module identity only if generation and pending UUID still
  match, then clears the journal. A definitive pre-commit 4xx rejection also clears
  it; CAS conflict replaces it only after the POST has definitively answered. It
  never increments `configVersion` locally.
- Only closed `ApiErrorCode.CapabilityConfigVersionConflict` becomes `Conflict` and
  triggers a fresh GET in the same actor generation; generic HTTP 409 and other
  capability errors become `Rejected`. The draft remains after real CAS conflict,
  is rebound to the fresh known row/version and requires explicit reconfirmation.
- The repository applies a finite command deadline. Status 0/5xx, deadline expiry,
  invalid JSON/row mapping, or a response whose module differs from the intent
  becomes `ResultUncertain` because the server may already have committed. It
  triggers observational refresh without retry, preserves the UUID/draft, and
  permanently blocks capability writes in that authentication epoch. A failed
  observational GET preserves `ResultUncertain`; it cannot downgrade to rejection.
  Other 4xx failures become `Rejected`; 401/403 clear all private state.
- Destroying the component while `Saving` cannot prove rollback: the journal stays
  locked and the next store instance restores `ResultUncertain`. Only a different
  authentication epoch removes that persisted barrier.
- A refresh must not clear a pending draft or result phase unless actor authority
  is lost. During `Saving`, manual refresh is disabled; programmatic observation
  starts only after the write settles. GET->POST and POST->observation callbacks use
  their independent ids, older GETs cannot replace newer state, and only the write
  callback matching actor generation + pending UUID may release the write fence.

## CSRF and security

- Existing `authInterceptor` attaches USER CSRF and rotates it from successful
  response headers. No token enters the command/domain object, logs or SDD.
- No automatic retry of mutations. The correlation UUID is generated with
  `crypto.randomUUID()` only after explicit confirmation and is preserved for an
  uncertain result.
- The UUID is audit correlation, not a durable idempotency key: the current backend
  neither enforces UUID uniqueness nor exposes result lookup. The UI never labels
  a matching post-refresh state as proof that its command succeeded.
- Reason is trimmed, bounded to 500 characters and never rendered as HTML.
- Only authoritative known rows are addressable. Commercial metadata, labels and
  `Unknown` wires never become a URL or payload.

## Test strategy

- Domain: closed phase/policy translation, intent validation, Unknown/version/
  unchanged/blank/oversize rejection and stable UUID.
- Repository: exact URL/method/body and returned authoritative mapping.
- Store: ADMIN vs OPERATOR, double-submit fence, authoritative success, error-code
  classified conflict + fresh read, other 409 rejection, timeout/invalid/mismatched
  success as uncertain, epoch-long write lock after uncertainty, authorization
  clearing, same-principal reauthentication, GET->POST/POST->GET ordering, actor
  swap, stale read/write suppression and synchronous pre-dispatch exceptions.
- Journal: strict round-trip, malformed entry fail-closed, same-epoch recreation
  after uncertain and after destruction during Saving, reload simulation, verified
  success/rejection clearing, and new-epoch unlock.
- View: editor availability, closed selector, validation, focus restoration,
  busy/announcement states, preserved commercial/technical presentation and no
  mutation control for OPERATOR/Unknown. The target selector receives initial
  focus. Escape/close is disabled while Saving; success restores the row trigger,
  authority loss focuses the page heading, and conflict/uncertainty announce in
  place without discarding the draft or moving focus unexpectedly.
- Gates: focused tests, full `npm run verify`, repository hygiene, exact-diff
  Bug/Product/UX and Security reviews, hosted Verify, merge and post-merge Verify.

## Non-goals and evidence limits

This cut proves the browser command contract against the already tested server
contract. It does not certify live providers or homologation and does not make a
capability ACTIVE by default. A mocked frontend repository test is not presented
as browser-to-PostgreSQL evidence; the hosted real E2E remains a regression gate.
