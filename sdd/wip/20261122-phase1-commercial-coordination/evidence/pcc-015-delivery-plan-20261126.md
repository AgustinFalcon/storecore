# PCC-015 bounded delivery plan — 2026-11-26

## Status and authority

This is an implementation plan, not implementation evidence. PCC-015 is `in_progress` for planning; PCC-015A through PCC-015F remain `pending`. No cut is complete merely because this plan exists. The source of truth is the functional Slice D and the technical PCC-014 exact loyalty contract delivered by PR #421, based on `c9ceacde4ec273ec7e09c884c31f1fe886058471`.

This branch still carries the pre-closeout PCC-014 task state. Preserve it until the independent PR #422 hosted-closeout change is integrated; this plan does not manufacture or replace its merge evidence. PCC-016, PCC-017 and PCC-018 remain pending. No provider, SMTP, fiscal, carrier or BlackStore activation is authorized by this plan.

## Ordered delivery

### PCC-015A — pure domain first

Implement small domain values for POINT, ARS minor units, revisions, identities, eligible snapshots, policy quotes, lots/allocations, reservations, cumulative corrections and recovery obligations. Every finite state, source, reason, command and result is a closed Kotlin enum or sealed type with one boundary translator and non-actionable Unknown. Step objects own quote, bind, commit, release, expiry, correction and recovery rules. Domain code imports no Spring, JDBC, HTTP or Jackson.

Start from failing behavior tests for checked arithmetic and closed transitions. Prove Policy V1 devengo after redemption, cap calculation, monetary cent allocation and tiny items; FIFO and equal-time tie order; lot conservation; exact TTL/365-day boundaries; terminal states; original-expiry restoration; cumulative targets and all-or-nothing held corrections. This cut adds no route, migration, scheduled work or production adapter. It may proceed independently of unresolved checkout integration sources because it consumes explicit typed inputs only.

### PCC-015B — durable wallet and ledger foundation

After A, implement application ports and PostgreSQL adapters for wallet identity/revision, immutable source applications, ledger, issued lots, allocation events, protected current partitions, private command receipts and audit. Candidate names are `LoyaltyWalletRepository`, `LoyaltyCommandPort`, `LoyaltyClock`, `LoyaltyIds` and `JdbcLoyaltyPersistence`; final names must follow repository conventions and each class has one responsibility.

The first candidate migration is `V41__loyalty_wallet_ledger.sql`, only if V41 remains unused at implementation time. Allocate subsequent migrations at their actual reviewed base; never edit a published checksum or pre-create unused later-cut tables solely to reserve a version. Wallet owns a CUSTOMER foreign key and lock/revision, not an authoritative mutable balance. Source effects and command UUIDs are unique in their specified namespaces. Protected projections have narrow writers, fixed search paths and exact grants; evidence remains append-only. Prove actual writers under `SET ROLE storecore_runtime`, clean install, V40 upgrade, immutability, malformed/unknown persisted data, conservation, overflow, source duplication and exact replay. Update historical maximum-schema assertions only when the new migration actually lands.

### PCC-015C — quoted holds, cancellation and explicit expiry

After B, add durable reservations, immutable ordered lot allocations, history and eventual order/payment bindings through a new forward migration. A successful quote is a real `QUOTED` hold. Under wallet lock, revalidate current authority/revision, materialize due free expiry, select FIFO allocations and persist effect plus receipt/audit atomically. Customer cancellation is valid only while unbound QUOTED; expiry uses a fresh instant after locks and the exact `now >= expiresAt` rule.

Prove concurrent first-wallet creation; two holds of 600 against 1,000 available; cancel versus expiry; TTL crossing during a lock wait; replay after later expiry; foreign actor/UUID conflicts; whole-transaction rollback; and fail-closed invalid partitions. Expose only bounded explicit application work at this stage; add no timer/scheduler. HTTP belongs to a separately reviewable subcut within the backend delivery and must satisfy the exact contract before PCC-016 UI delivery.

### PCC-015D — evidenced checkout and exact amounts

After C, close the eligibility and monetary blockers below, then implement `LoyaltyEligibilityPort` and `LoyaltyCheckoutPort` or equivalent repository-native ports. Missing classification or tax evidence returns typed unavailable; it never assumes STANDARD or zero tax. Freeze per-item eligibility, allocated discount and earning basis as immutable evidence.

Extend local checkout fingerprint and receipt correlation with the selected reservation and revision. In the same transaction, validate cart/policy/snapshot/ownership/revisions/TTL, create local order/payment and promote the exact hold to PAYMENT_PENDING before `attachRemoteCheckout` or any remote attempt. A no-loyalty checkout remains usable. Prove exact payable amount from line amounts, allocated monetary discount, tax and shipping through order reads, provider request and reporting; do not distort unit prices to make cent allocation fit quantity.

Coordinate the required nullable checkout request field with the frontend repository, synthetic fixtures and real E2E callers in this cut. Preserve the existing checkout body idempotency contract; loyalty command routes use their specified header. Prove no partial binding after rollback, cart/snapshot changes, expired and foreign reservations, late accreditation, and request replay with a different reservation rejected.

### PCC-015E — durable accreditation projection and terminal outcomes

After D, implement the idempotent loyalty projection from an immutable, fully correlated PAYMENT_ACCREDITED application. The payment commits independently; durable local evidence permits explicit recovery after a crash before loyalty projection. Mutable order/payment status, redirect and provider JSON are not earning authority. Persist one source outcome or deterministic reconciliation case.

Prove payment commit followed by projector interruption, duplicate projection, exact once-per-order outcome, inconsistent identities/amount/currency, approved stock-review cases under the strict existing classifier, unknown outcome retaining the hold, late valid approval, proven unpaid terminal release and immutable receipts. No new provider activation or automatic projector scheduler is included. Any invocation wiring is separately reviewed and remains bounded.

### PCC-015F — pure correction, restoration and recovery

After the relevant persistence and reservation contracts, implement the pure typed correction port and durable cumulative targets, restoration allocations, recovery obligations and RECHECK. Requested targets and applied targets remain distinct. One correction that touches a held unit applies zero partial ledger/recovery/lot effect and can be reconsidered after implicated reservations settle. Restoration retains original expiry and partitions gross credit exactly; recovery never produces a negative wallet.

Prove repeated/out-of-order corrections, partial-to-full targets, cent allocation over partially returned quantities, original-expiry restoration, multiple original lots, recovery settlement, held correction and later recheck, refund/return/chargeback cumulative caps, unknown authority and rollback. Test sources are explicit fixtures. A production correction adapter remains blocked until the separately reviewed immutable monetary source exists; RMA disposition, stock quantities and provider JSON cannot fill that gap.

## Structural ordering and invariants

- Authentication/session mutation locks precede domain locks through the existing identity coordinator. ADMIN customer-targeted changes use the appropriate target scope and revalidate current roles.
- An existing-order writer locks order before wallet, then implicated reservations and sorted lot/allocation identities. Checkout obtains creation/cart authority before wallet. Wallet-only commands never acquire an existing order after wallet. Preserve the payment writer's existing order-before-attempt/payment ordering.
- Effect, partition projection, ledger, source application, receipt and audit either commit together or roll back together. An independently committed payment/refund/RMA does not roll back due to loyalty uncertainty.
- For every lot, issued equals free plus held plus redeemed plus expired plus reversed. Availability derives from unexpired free units after recovery; no overlapping category is subtracted twice.
- Reserve uses frozen FIFO allocations; only unbound QUOTED expires; PAYMENT_PENDING and uncertain holds retain allocation until authoritative terminal evidence. Unknown persisted/wire state grants no action.
- Reconciliation rereads admitted evidence. An ADMIN cannot supply a payment/correction result or fabricate release. Every well-formed authorized business outcome has a durable historical receipt; 404 receipt recovery never proves non-application.

## P2 integration blockers to resolve before the affected cut

1. **Eligibility source (D):** current catalog/order snapshots do not provide independently evidenced outlet classification and separated tax basis. Define and review an explicit source; keep the port unavailable when evidence is absent. No historical inference/backfill.
2. **Order monetary model (D):** current orders require total = subtotal + shipping, and immutable order items require subtotal = quantity times effective unit price. A cent-level order discount can be indivisible by quantity. Add explicit discount/snapshot representation through a forward migration and reconcile exact net subtotal, order presentation, provider amount and reporting. Never round away the discount or change published migrations.
3. **Capability admission (B-D):** existing LOYALTY/POST_LEDGER does not define all CUSTOMER/read/terminal actions. Review exact closed action authorization and the handling of already-held terminal work while new spending is disabled. Do not bypass capability gates or silently reactivate the module.
4. **HTTP/CSRF coordination (C-D):** loyalty business-rejection receipts need exact CUSTOMER and USER ADMIN 409 handling in the CSRF interceptor, tied to principal/authentication generation. Use strict 8-KiB JSON translators with duplicate/extra/trailing/UTF-8 rejection, private receipts and current authorization; do not inherit permissive cart request parsing.
5. **Schema assertions (B and later migrations):** tests expecting latest V40 must follow an actually delivered V41/newer schema with clean/upgrade evidence. A changed expected version is not migration evidence by itself.
6. **Production monetary correction source (F activation):** the immutable admitted refund/correction contract remains absent. Pure domain/port/persistence tests may proceed; production return/refund correction effects stay unavailable until that independent source is approved and implemented.

These are implementation gates, not assertions that this plan or PCC-014 already fixes current code. A and bounded pure behavior work can proceed while the integration gates remain open.

## Verification and closure

Use red -> green for each behavior slice, first the narrow suite, then affected repository suites. Candidate new test names are plans, not tests claimed to exist:

```powershell
# Run in backend, after the named tests are implemented.
mvn -B "-Dtest=LoyaltyPolicyTest,LoyaltyLotTest,LoyaltyReservationTest,LoyaltyCorrectionTest" test
mvn -B "-Dtest=LoyaltyPersistencePostgresTest,LoyaltyMigrationTest" test
mvn -B "-Dtest=LoyaltyCheckoutIntegrationTest,MpOrdersCheckoutIntegrationTest" test
mvn -B test
```

```powershell
# Run at the repository root.
node --test .github/scripts/repository-hygiene.test.mjs
node .github/scripts/repository-hygiene.mjs
git diff --check
```

Add HTTP authorization/idempotency/concurrency tests and the affected Angular contract/CSRF/E2E suites when their cuts change that boundary. Every cut has an evidence record with commands/results/residual gates, two independent GPT-6.1 Sol medium reviews of the exact commit, hosted CI and merge evidence before its task is completed. Parent PCC-015 completes only after all six cuts and required delivery evidence exist. PCC-016 supplies the customer/admin UI; PCC-017 retains integrated browser, accessibility, cumulative-correction and final delivery validation. No `/sdd.finish` or WIP archive is authorized while any required task or deferred external gate remains open.
