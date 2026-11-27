# PCC-015D checkout contract and RED plan — 2026-11-27

## Status, scope and evidence boundary

This record closes the planning questions for PCC-015D. It is not implementation, runtime activation, provider accreditation or completion evidence. PCC-015D remains `in_progress` until D0 through D3 are implemented, reviewed, exercised in hosted CI and merged. PCC-015E through PCC-018 remain pending.

The audit covered the current cart/checkout transaction, loyalty Policy V1 domain and V42/V43 reservation persistence. It found two incompatible identities and one insufficient monetary representation that must be corrected forward-only:

- commerce cart revision is a lowercase 64-hex SHA-256 fingerprint, while the loyalty reservation `cart_revision` is a non-negative `BIGINT`/`LoyaltyRevision`;
- an order item currently requires `subtotal = quantity * effective unit price`, so a one-cent loyalty discount on a quantity greater than one cannot always be represented without corrupting the unit price;
- current product/order evidence does not contain a closed loyalty classification plus separately evidenced excluded tax.

No conversion, truncation or hash-to-Long mapping is admitted. No historical reservation receives an inferred cart fingerprint, classification or tax split. Existing reservations without the new evidence remain readable under their historical contract but are ineligible for checkout binding.

## Closed domain contract

All finite values are Kotlin `enum class` or `sealed interface`; wire/persistence translation occurs once at the boundary and unknown input maps to a non-actionable Unknown/Unavailable case.

- `CartFingerprint` is a distinct value object containing exactly one lowercase 64-hex SHA-256. It is not a loyalty revision.
- wallet, reservation and eligibility-snapshot revisions remain checked non-negative `Long` values with separate types.
- `LoyaltyItemClassification` remains closed `STANDARD|OUTLET|GIFT_VALUE|LOYALTY_VALUE|UNKNOWN`; only STANDARD can contribute an eligible base.
- eligibility admission is `Available(snapshot)|Unavailable(reason)`. Reasons are closed at least `MISSING_PROFILE|MISSING_TAX_EVIDENCE|WRONG_CURRENCY|CONTRADICTORY_BREAKDOWN|STALE_SOURCE|CART_CHANGED|DISCOUNT_PRESENT|UNKNOWN`.
- immutable price evidence is the exact joined result of the existing cart price authority and a new `catalog_loyalty_price_profiles` merchant authority. A profile is versioned per variant and exact gross unit price; it contains currency ARS, classification, merchandise-excluding-tax unit minor, excluded-tax unit minor, closed evidence kind `MERCHANT_ACCOUNTANT_PROFILE|UNKNOWN`, a non-secret 1..128-byte source reference, positive revision, authorizing ADMIN command id and recorded instant. Its two unit components must sum to the profile gross unit price. Only a same-origin authenticated USER ADMIN catalog command with CATALOG write admission may create the next revision, and UNKNOWN/missing evidence is rejected; rows are append-only and runtime cannot update/delete them. This is merchant promotional evidence for loyalty only, not ARCA/fiscal authority and never invoice evidence.
- flow steps are separate objects: admit evidence, verify quote correlation, allocate exact cents, calculate payable lines, and bind the reservation. No step imports Spring, JDBC, HTTP or provider APIs.

The stable pre-order line identity is the positive `cart_items.id` plus its variant identity, quantity and frozen price fields. Quote evidence and final order evidence are distinct. Quote freezes each stable line, source-profile identity/revision, cart fingerprint, eligible bases, selected points and order-level monetary discount; it does not claim a final per-line allocation. Bind creates all order item ids, proves one-to-one correlation with every quoted stable line, then allocates the already frozen discount: proportional floors over the quoted eligible bases followed by remainder cents in ascending final order-item id. The final immutable snapshot stores that allocation and correlation. SKU, insertion order, display order and mutable product data never decide allocation or allow substitution by an equal-total line.

## Eligibility and exact money

The current catalog price is not, by itself, evidence of tax separation or loyalty classification. D1 introduces the exact append-only `catalog_loyalty_price_profiles` authority described above. It is empty for historical products unless the authenticated ADMIN command records a profile whose gross unit minor exactly equals the currently resolved catalog/cart unit price. Profiles use tax-inclusive retail pricing: `grossUnitMinor = merchandiseExcludingTaxUnitMinor + excludedTaxUnitMinor`; checkout preserves that gross price and subtracts loyalty only from its eligible merchandise component. Profile writer, quote and bind all lock the same product then variant row before resolving or assigning the latest profile revision; they reread the latest head under that lock and then lock the chosen immutable profile. Neither a concurrent newer insert nor a stale head can pass. Redemption additionally requires `discountAmount=0`, no offer and no campaign. A price, profile, quantity or cart-fingerprint change rejects redemption rather than re-pricing the sale. Missing evidence yields `Unavailable`; ordinary checkout without loyalty continues.

Every checkout, including explicit `loyaltyReservation:null`, attempts to freeze final earning evidence. With null selection, a matching latest profile for each exact effective gross unit price may include an existing offer/campaign discount: allocated loyalty discount is zero, payable line equals the frozen effective gross, and final earning uses its evidenced post-discount merchandise-excluding-tax amount. If any profile is absent, stale or contradictory, checkout still succeeds but stores one immutable typed loyalty-unavailable snapshot/reason; PCC-015E must not guess or backfill earnings. A redeeming checkout requires the quote/final two-stage evidence and forbids stacking as above.

All arithmetic uses checked integers/arbitrary precision before bounded conversion. Each frozen line stores:

- original unit price and quantity;
- gross merchandise before loyalty;
- evidenced excluded tax;
- eligible pre-redemption amount;
- allocated loyalty discount;
- net payable line amount;
- final earning amount;
- classification, existing-discount state, source evidence id/revision, policy version and cart fingerprint.

Exact equations are:

```text
grossLineBeforeLoyalty = evidencedMerchandiseExcludingTax + evidencedExcludedTax
grossLineBeforeLoyalty = quantity * frozenCartEffectiveUnitPrice
eligiblePreRedemption = evidencedMerchandiseExcludingTax, only for STANDARD; otherwise 0
payableLine = grossLineBeforeLoyalty - allocatedLoyaltyDiscount
finalEarning = eligiblePreRedemption - allocatedLoyaltyDiscount
orderNetSubtotal = sum(payableLine)
orderTotal = orderNetSubtotal + shippingAmount
```

The existing cart retail price is tax-inclusive. The profile decomposes, but never changes, that exact gross price; D never adds tax twice. Allocated discount cannot exceed the eligible base. Shipping and excluded tax never earn or absorb loyalty discount. OUTLET, GIFT_VALUE, LOYALTY_VALUE and UNKNOWN contribute zero eligible base. Any manual, campaign, offer or other line discount makes redemption unavailable under Policy V1.

The order schema gains explicit immutable line discount/net columns or an immutable companion snapshot; original unit prices remain unchanged. Order reads, Mercado Pago attempt amount and reporting must consume the same exact order total. A compatibility read may expose historical orders, but must not fabricate a discount or tax split.

## Persistence and state transition

D migrations are forward-only after the actual latest version and never edit V42/V43. They add:

- the exact cart fingerprint and immutable versioned eligibility snapshot;
- line-level monetary evidence and order-item correlation;
- one unique reservation-to-order/payment binding;
- reservation/history support for `PAYMENT_PENDING` and later uncertainty without releasing its held allocation;
- append-only/immutable protections, correlation constraints and narrow fixed-search-path writers.

The V42 constraint and V43 owner-only writers currently recognize only QUOTED closure paths. D must replace affected constraints/functions in a new migration and prove both clean installation and upgrade with existing reservations. Existing QUOTED rows without a fingerprint are never silently bindable. `PAYMENT_PENDING` is not released or expired by the quote TTL.

Local checkout ordering remains: authenticated CUSTOMER/session mutation lock, cart/creation authority and product/variant/inventory locks, wallet/reservation lock, fresh time and source revalidation, local order/items/payment/snapshots/binding, cart clear and session rotation. All local effects commit atomically. Remote checkout attachment and provider network work start only after that commit. A rollback at any local step leaves no order, payment, reservation transition, monetary snapshot, inventory reservation or cart clear.

The exact replay identity includes checkout idempotency key, cart fingerprint, delivery/address/configuration/currency and the selected loyalty reservation id plus expected reservation revision, including explicit null. Reusing the key with a changed selection conflicts. After current CUSTOMER authentication and ownership checks, exact idempotency lookup occurs before new-effect BIND admission, TTL or QUOTED-state validation. A completed matching local claim performs no loyalty transition and does not require BIND_CHECKOUT or QUOTED again; it returns the immutable local result even if loyalty was later disabled. Commerce response state and checkout URL remain enrichment: exact retry reads current local order/payment status and, only when separate PAYMENTS_MP admission permits, invokes the existing idempotent remote-attempt start/recovery. Otherwise it truthfully returns local pending without a URL. A crash between local commit and remote attachment produces no second local order, payment, stock reservation, loyalty bind or discount and can later recover a usable provider URL. Mutable provider/order status never rewrites frozen monetary/loyalty evidence.

### Quote and bind algorithm

New reservation quote execution, under the authenticated CUSTOMER identity transaction, is exact:

1. Admit `RESERVE`, lock the customer's cart and stable cart items, validate owner/session and the submitted cart fingerprint.
2. Lock products then variants in ascending identity order, reread the latest profile head under the same variant lock used by the writer, then lock exact profile revisions; build and persist immutable quote lines and their canonical snapshot hash. Re-read all price/profile facts after lock acquisition.
3. Lock the customer's wallet, materialize due free expiry, compare the caller's expected pre-command wallet revision, compute the Policy V1 cap and lock selected lots in canonical FIFO/id order.
4. Persist the QUOTED reservation, ordered point allocations, cart fingerprint, quote snapshot/hash, `walletRevisionBefore` and the actual `walletRevisionAfter` produced by the hold, plus receipt/audit atomically. The old V43 numeric `cart_revision` is legacy evidence only.

Checkout bind, still inside the existing authenticated CUSTOMER local checkout transaction, is exact:

1. After current-auth exact replay lookup finds no completed matching claim, admit `BIND_CHECKOUT`, lock/revalidate the same customer/session/cart and stable line facts, then products/variants; reread latest profile heads under the shared variant locks and lock profile/inventory identities in canonical order.
2. Lock the wallet, reservation, reservation state, quote snapshot and sorted lot/allocation identities. Re-read time after waits.
3. Require same owner, policy, cart fingerprint and quote hash; QUOTED state; caller's expected reservation revision; `now < expiresAt`; non-Unknown evidence; intact held allocations summing to points; and non-exhausted wallet/reservation revisions. The quote's wallet-before/after values are historical evidence, not a CAS against the current wallet: unrelated later wallet commands may advance it, while any corruption of the held allocations or partitions fails closed.
4. Create all local order items, prove bijection to quote lines, allocate the frozen order-level discount by final order-item id, persist final immutable snapshots and exact order/payment amounts, bind reservation/order/payment uniquely, transition QUOTED to PAYMENT_PENDING and advance wallet/reservation revisions.
5. Complete inventory reservation, shipment, claim and cart clear in the same transaction. Any failure rolls everything back. Remote attachment begins only after commit.

## Capability, HTTP and frontend contract

The closed loyalty admission actions are `READ_SELF|READ_ADMIN|RESERVE|BIND_CHECKOUT|CANCEL_HELD|EXPIRE_QUOTED|ADMIN_ADJUST|TERMINAL_SETTLE|UNKNOWN`. CUSTOMER may use READ_SELF, RESERVE, BIND_CHECKOUT and CANCEL_HELD only on its own current identity; USER ADMIN may use READ_ADMIN and ADMIN_ADJUST; SYSTEM may use EXPIRE_QUOTED and TERMINAL_SETTLE. OPERATOR, Public and Unknown are denied. With no active kill switch, ACTIVE admits all actor-authorized actions; READ_ONLY admits reads plus CANCEL_HELD, EXPIRE_QUOTED and TERMINAL_SETTLE; PAUSED, ERROR and DISABLED admit only reads plus those three safety actions. RESERVE, BIND_CHECKOUT and ADMIN_ADJUST require ACTIVE. An active or corrupt kill switch blocks every action except capability STATUS/HEALTH; existing holds remain held until the switch is explicitly and auditably cleared, after which safety actions cannot be blocked by the configuration state. Unknown module/config/action/actor fails closed. D implements this typed `LoyaltyActionAdmission` instead of mislabelling a safety mutation as READ or bypassing admission. Runtime has only narrow writer execution and required reads; it receives no general DML on protected loyalty or catalog-profile projections.

Checkout keeps its body idempotency contract. Its exact JSON adds required nullable `loyaltyReservation`: explicit `null` means no loyalty; otherwise the exact object is `{reservationId,expectedReservationRevision}`. Missing field, extra/duplicate fields, invalid UTF-8, trailing tokens, non-canonical UUID/revision, wrong media type or more than 8 KiB is rejected before mutation. The browser never supplies classification, tax, price, discount, actor, policy or payment result.

Profile administration is a separate USER ADMIN catalog command: `POST /api/v1/user/catalog/variants/{variantId}/loyalty-price-profiles` with exact body `{currency,grossUnitMinor,merchandiseExcludingTaxUnitMinor,excludedTaxUnitMinor,classification,evidenceKind,sourceReference,expectedProfileRevision}` and canonical `Idempotency-Key`. It uses strict 8-KiB JSON, USER CSRF/origin/auth-generation fencing, CATALOG write admission and durable receipt/audit. Monetary minors and revisions are canonical decimal strings. It can append only the next revision for the current variant and resolved gross price; it cannot rewrite history. PCC-015D adds only this backend authority; any richer ADMIN profile UI is scheduled with PCC-016 and cannot weaken the command.

Known authorized loyalty business conflicts persist their private receipt/audit and rotate the correct realm CSRF in the committed transaction; HTTP 409 conversion occurs after commit, not through an exception that rolls it back. Foreign/missing remains indistinguishable 404 and persists nothing. The Angular command keeps the selected reservation, including null, frozen through retry/recovery and is bound to CUSTOMER principal, auth generation and request sequence. Its closed mappers reject Unknown/corrupt evidence.

## Delivery cuts

### PCC-015D0 — contract and RED gate

Persist this audit, exact decisions and test matrix. Two independent GPT-6.1 Sol medium reviews must approve the exact documentation head before implementation. No production code or schema in this cut.

### PCC-015D1 — pure domain and non-operative evidence schema

Start with failing tests for closed values, evidence admission, exact equations and deterministic cent allocation. Add a forward migration for immutable eligibility/monetary evidence, cart fingerprint and PAYMENT_PENDING-capable reservation history, with no route, Spring bean, provider call or capability activation. Prove clean install, upgrade from V43 with historical reservations, immutability, least privilege and corrupt/unknown rows.

### PCC-015D2 — atomic local checkout binding

Integrate the evidence port with local checkout, create order/payment/snapshots and bind QUOTED to PAYMENT_PENDING in one local transaction before remote attachment. Update order reads, provider-attempt amount and reporting to the exact same total without modifying original unit prices. Preserve no-loyalty checkout. Prove concurrency, rollback, replay and lock order.

### PCC-015D3 — exact HTTP, capability and Angular boundary

Add the strict nullable request contract, action-specific grants/capabilities, the strict ADMIN catalog-profile command, committed 409 receipt handling and typed Angular selection/recovery. Add real boundary/E2E callers and synthetic fixtures through the same translators. Defaults remain fail closed; no external provider, scheduler or terminal-accreditation activation is introduced.

## RED verification matrix

1. Missing/Unknown classification, missing tax evidence, wrong currency, contradictory sums, gross profile price unequal to `quantity * effectiveUnitPrice`, stale/mutated source revision and existing discount all make redemption unavailable while no-loyalty checkout remains usable. Null selection freezes exact zero-redemption earning evidence when profiles match, or a typed immutable unavailable reason when they do not.
2. Mixed STANDARD/OUTLET/GIFT_VALUE/LOYALTY_VALUE cart proves only STANDARD merchandise excluding tax is eligible; shipping and tax are excluded.
3. A valid 1 POINT = 100-cent order discount across quantity three, with a one-cent allocation remainder, plus tiny lines, many lines and remainder ordering proves exact sum, deterministic allocation and no line over-allocation.
4. Same cart total with changed quantity, variant, tax, classification or source revision rejects the frozen quote.
5. Any failure after order, item, payment, snapshot or binding write rolls back every local effect.
6. Bind races cancel/expiry; two checkouts for one reservation have one winner; a lock wait crossing TTL rereads fresh time; foreign owner/session, stale/Unknown reservation revision, revoked authority during wait and exhausted revisions fail closed.
7. PAYMENT_PENDING survives quote TTL and is not released by C expiry logic.
8. Current-auth exact replay lookup precedes new BIND/state/TTL admission and preserves the frozen local result even when loyalty is later disabled; same UUID/key with another reservation, revision or explicit-null selection conflicts. Crash after local commit/before remote attach followed by exact retry creates one order/payment/binding/discount and idempotently starts or recovers one remote attempt when PAYMENTS_MP permits; otherwise it returns local pending without a URL.
9. Order read, provider attempt and reporting expose the same net subtotal/shipping/total while original unit prices remain intact.
10. Clean install and V43 upgrade with existing reservations pass; runtime role can execute only the reviewed writers; old migration checksums are unchanged.
11. Quote and final snapshots, profile revisions, classifications, tax evidence, net values and binding are immutable and uniquely correlated; quote lines and order items have a proven bijection.
12. HTTP tests cover 8192/8193 bytes, missing/duplicate/extra/trailing/invalid UTF-8, canonical UUID/revision, media type, privacy 404, durable 409 and realm/generation CSRF fencing.
13. Browser tests cover explicit null, selected reservation, reload/recovery, duplicate submit and principal/auth-generation change.
14. Admission tests cover every action/actor/state cell, active/corrupt kill switch, clearing the switch, spending denied outside ACTIVE and safety settlement admitted after clearing even when DISABLED/ERROR.
15. A wallet command after quote may advance wallet revision without invalidating intact held allocations; altered/missing allocations, wrong quote hash or source mutation fails closed.
16. Profile writer versus quote and writer versus bind races share product/variant authority locks: either the new head is observed or the older head wins before append; no stale head is admitted after lock acquisition.
17. Explicit-null checkout with a matching discounted-price profile freezes allocated loyalty zero and exact post-discount earning basis; absent evidence records typed unavailable without blocking purchase or later inventing points.

PCC-015E continues to own accreditation, late provider outcomes and terminal projection. PCC-015F continues to own corrections. PCC-016 owns wallet/admin UI. D does not claim those later behaviors.
