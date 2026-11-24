# Technical specification — Phase 1 commercial coordination

## Boundaries

The feature is split into four modules: `notification`, `commercialcalendar`, `channelreporting` and `loyalty`. Domain packages import no Spring, HTTP, SQL or Angular. Application services depend on ports; infrastructure adapters own JDBC, clocks, UUIDs and external delivery.

## Closed domain types

Kotlin uses `enum class` or `sealed interface` for alert severity/category/lifecycle, calendar lifecycle/transition/audience, channel/source/freshness, report period state, loyalty unit/movement/reservation state and every command result. Angular uses private-token classes with canonical static instances and one `fromWire`; `Unknown` is always present. Labels and transition rules live in the type, never in view string switches.

Notification domain freezes these cases: severity `INFO|WARNING|CRITICAL|UNKNOWN`; category `STOCK|ORDER|PAYMENT|RETURN|INTEGRATION|CAMPAIGN|UNKNOWN`; lifecycle `OPEN|ACKNOWLEDGED|RESOLVED|UNKNOWN`; source `STORECORE_FACT|BLACKSTORE_STOCK_RECEIPT|SYSTEM_CAMPAIGN|UNKNOWN`. Transition step objects implement only acknowledge `OPEN -> ACKNOWLEDGED`, resolve `OPEN|ACKNOWLEDGED -> RESOLVED`, and reopen `RESOLVED -> OPEN`. Unknown has no actions. The aggregate increments a non-negative revision with checked arithmetic and never mutates source identity or fingerprint.

## Persistence

- Notifications: append-only source events, current alert projection, command receipt and audit tables. Unique `(source_type, source_id, fingerprint)`.
- Calendar: event identity, revisioned definition, transition receipt and audit. Timestamps are instants; merchant timezone is a validated IANA identifier stored with the event.
- Reports: no duplicate business truth. Read models query authoritative StoreCore tables. Existing BlackStore receipts expose only stock/version/availability, never monetary facts. A future BlackStore commercial projection requires a separate reviewed contract and migration.
- Loyalty: append-only ledger, earning-lot allocation, recovery-pending adjustment and reservation records. Unique source/idempotency keys; balance uses checked integer arithmetic. No mutable balance column is authoritative. Reserve/commit/release/expire lock one customer ledger in PostgreSQL so availability is recalculated and mutated atomically.

Every migration supports clean install and upgrade from the current schema, has constraints equivalent to domain validation and preserves published checksums.

Notification ingestion treats the source delivery UUID and the logical episode identity independently. Replaying one delivery UUID with a different canonical event hash is a conflict. A different delivery for the same `(source_type, source_id, fingerprint)` appends source evidence but preserves the existing alert lifecycle, category and original severity; it never reopens, silently reclassifies or escalates the projection. A genuinely new severity policy or recurrence requires an explicit future command or a different producer-owned episode key.

Notification V1 bounds are shared by domain, HTTP and DDL: `source_id` 1..128 UTF-8 bytes; condition code 1..64 uppercase ASCII characters plus digits, `_`, `-` and `.`; episode key 1..128 UTF-8 bytes; lifecycle command reason 1..500 Unicode code points after trimming only ASCII space, tab, LF, CR, vertical tab and form feed from both edges; fingerprint exactly 64 lowercase hexadecimal characters. Every PostgreSQL `TEXT` value rejects `U+0000` in the domain before persistence. The producer passes a typed source identity and stable episode key. Fingerprinting uses SHA-256 over a versioned, length-prefixed UTF-8 sequence, never string concatenation. Event delivery identity, source identity, episode fingerprint and command payload hash are distinct value objects. Missing episode identity fails validation; time-bucket inference is forbidden.

## Commands and consistency

Every mutation derives the actor from the authenticated session and carries a command UUID and expected revision where applicable. A command key is scoped to operation, aggregate and actor and bound to a canonical payload hash. Replay requires current authorization and returns the prior receipt only for the same authority and payload; different content or aggregate fails closed. Receipt, effect and audit commit in one transaction. Calendar scheduling and alert lifecycle use compare-and-set. Loyalty flow is composed of independent quote, reserve, commit, release/reverse and reconcile step objects.

PCC-002 persists immutable receipts for every well-formed, currently authorized notification lifecycle command against an existing aggregate, including `APPLIED`, `REVISION_CONFLICT`, `INVALID_TRANSITION` and `REVISION_EXHAUSTED`. The receipt stores the original typed result and historical snapshot; an exact replay returns that result even if the alert later changes, after authorization is checked again. Unknown/malformed commands, missing aggregates and unauthorized attempts do not create receipts. A command UUID reused with a different actor, aggregate, operation or canonical payload is always an idempotency conflict.

Loyalty policy is immutable and versioned on every quote/reservation. Policy V1 implements the functional numeric rules. Each reservation references its policy version and eligible-price snapshot. Reservation state is closed: `QUOTED`, `PAYMENT_PENDING`, `COMMITTED`, `RELEASED`, `UNKNOWN`. Creating the payment attempt and promoting `QUOTED` to `PAYMENT_PENDING` share one transaction; only `QUOTED` is TTL-expirable. Provider uncertainty remains held until reconciliation. PostgreSQL tests race two individually valid reservations whose sum exceeds availability; at most one commits, and another test crosses quote expiry with late payment approval without double spend.

Return processing stores cumulative eligible value returned plus prior earned-reversal and redeemed-restoration totals. Each partial return applies only the checked delta to the cumulative target, with exact original totals at 100%. Recovery-pending adjustments reduce future earn availability but never block or roll back an authoritative refund or return.

## HTTP and authorization

- `/api/v1/user/notifications`, `/api/v1/user/commercial-calendar`, `/api/v1/user/channel-reports`, `/api/v1/user/loyalty` require USER realm and explicit role policy.
- Slice A notification reads allow `ADMIN` and `OPERATOR`; acknowledge, resolve and reopen allow `ADMIN` only. The application derives the actor and role from the live USER session on every command and replay.
- `/api/v1/customer/loyalty` reads only the authenticated customer ledger.
- POST commands require CSRF, JSON content type, idempotency key, bounded payloads and audited actor identity.
- BlackStore ingestion remains behind the existing disabled capability and authenticated/versioned stock receipt contract; no trusted `X-Actor-Id`/`X-Role` shortcut is introduced. Monetary reporting stays unavailable until a new commercial-facts contract passes review.

## Frontend

Each feature has a plain domain model, repository port, store/use case and presentational components. Routes are lazy. Query filters are URL-backed. All lists are paginated and expose honest loading/empty/error/stale states. Demo fixtures pass through the same domain translators and cannot construct arbitrary states.

## Delivery and failure

In-app notification persistence commits before optional email delivery. Email uses an outbox and retry policy; it cannot change alert lifecycle. Report freshness is explicit. BlackStore commercial reporting produces `NOT_AVAILABLE`; stock freshness may be `UNAVAILABLE` or `STALE`, never zero. Loyalty uncertainty blocks a second loyalty effect until reconciliation but never blocks an independently authoritative refund or return.

## Verification gates

For every slice: domain/unit tests, PostgreSQL 16 clean/upgrade tests, HTTP authorization/idempotency/concurrency tests, Angular component/store tests, real browser journeys, build, repository hygiene, two independent GPT-6.1 Sol reviews on exact head, hosted CI and post-merge evidence. External activation remains a separate future gate.

