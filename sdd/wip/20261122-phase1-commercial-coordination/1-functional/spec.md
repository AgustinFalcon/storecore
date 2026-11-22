# Functional specification — Phase 1 commercial coordination

## Objective

Complete the integral StoreCore Phase 1 with operator-facing coordination that is useful without external homologation: one notification center, a configurable commercial calendar, consolidated StoreCore/BlackStore visibility and a promotional loyalty balance. The system must never describe fictitious points as money or cryptocurrency.

## Actors

- `ADMIN`: configures rules, acknowledges, resolves and reopens alerts, manages campaigns and performs audited loyalty adjustments.
- `OPERATOR`: reads operational alerts, calendar and reports. In Slice A it is read-only; notification lifecycle commands are ADMIN-only.
- `CUSTOMER`: reads its own loyalty balance and immutable movement history, and may request or cancel a redemption reservation for its own checkout under the active policy.
- `SYSTEM`: records deterministic events from authoritative StoreCore facts and, only when enabled, accepted BlackStore receipts.

## Slice A — notification center

- PCC-R01: expose one paginated inbox for stock, order, payment, return, integration and campaign alerts.
- PCC-R02: severity, category, lifecycle and source are closed types. Unknown wire values render as neutral unknown and cannot trigger actions.
- PCC-R03: acknowledge, resolve and reopen are explicit idempotent commands with actor, timestamp, reason and revision.
- PCC-R04: duplicate source events converge on one alert fingerprint; a replay cannot create a second alert.
- PCC-R05: email is an optional delivery projection. Failed or disabled SMTP never loses the in-app alert.
- PCC-R05A: Slice A freezes the vocabularies as severity `INFO`, `WARNING`, `CRITICAL`, `UNKNOWN`; category `STOCK`, `ORDER`, `PAYMENT`, `RETURN`, `INTEGRATION`, `CAMPAIGN`, `UNKNOWN`; lifecycle `OPEN`, `ACKNOWLEDGED`, `RESOLVED`, `UNKNOWN`; source type `STORECORE_FACT`, `BLACKSTORE_STOCK_RECEIPT`, `SYSTEM_CAMPAIGN`, `UNKNOWN`.
- PCC-R05B: the only valid lifecycle graph is acknowledge `OPEN -> ACKNOWLEDGED`, resolve `OPEN|ACKNOWLEDGED -> RESOLVED`, and reopen `RESOLVED -> OPEN`. Self-transitions, commands from `UNKNOWN` and every other jump fail closed. A replay is recognized only by its original command receipt, never because the aggregate already has the requested destination state.
- PCC-R05C: `source_id` is the stable authoritative identifier supplied by the typed producer, not a URL, localized label or delivery UUID. One alert episode is identified by `(source_type, source_id, fingerprint)`. The V1 fingerprint hashes the length-framed UTF-8 tuple `notification-v1`, category, stable condition code and producer-owned episode key. Delivery time, title, localized body, severity and personal data are excluded. A retry reuses the same episode key; a genuine recurrence must provide a new stable episode key. Duplicate events never reopen a resolved alert.

## Slice B — commercial calendar

- PCC-R06: merchants create draft events with timezone, start/end, audience, campaign reference and optional reminder rules.
- PCC-R07: lifecycle is `DRAFT`, `SCHEDULED`, `ACTIVE`, `PAUSED`, `COMPLETED`, `CANCELLED`, `UNKNOWN`; transitions are closed commands and invalid jumps fail closed.
- PCC-R08: scheduling requires preflight, explicit approval, bounded window and revision compare-and-set. This first slice is agenda/reminders only: it never changes price, offer, stock, checkout or customer eligibility. Pause stops future reminders without deleting history.
- PCC-R09: no named holiday or promotion is hardcoded. Black Friday is ordinary merchant data.
- PCC-R10: calendar UI provides month/list views, filters, empty/error/loading states and accessible keyboard navigation.

## Slice C — cross-channel reporting

- PCC-R11: expose authoritative StoreCore facts and a separate BlackStore integration-status/freshness panel. Do not infer BlackStore sales, payments or returns from stock saga receipts.
- PCC-R12: report periods use merchant timezone and immutable inclusive/exclusive boundaries shared by sales, payments, stock movements and returns.
- PCC-R13: the existing BlackStore contract contributes only its declared stock/version/availability fields. Monetary and commercial aggregates remain `NOT_AVAILABLE` until a separate read-only commercial-facts contract defines authority, event identity, corrections, reversals, retention, deduplication and version migration and passes its own SDD review.
- PCC-R14: StoreCore reports offer totals, best sellers, low stock, payment disposition and return disposition with CSV export protected against formula injection. Channel mix is shown only for authoritative sources; absent BlackStore facts are unavailable, never zero.
- PCC-R15: every card links to its filtered operational surface and preserves the exact report period.

## Slice D — loyalty ledger

- PCC-R16: loyalty is an internal promotional ledger denominated in integer `POINT`; it is not legal tender, cryptocurrency, withdrawable money or a customer deposit. Policy V1 grants 1 point per complete ARS 1,000 of eligible paid merchandise, rounding down, after authoritative payment approval. Shipping, taxes, outlet items and gift/loyalty value are ineligible.
- PCC-R17: movements are immutable `EARN`, `REDEEM`, `EXPIRE`, `REVERSAL`, `MANUAL_ADJUSTMENT`, `UNKNOWN` entries with source identity, actor and idempotency key.
- PCC-R18: balance is derived from accepted ledger entries. Negative balances, unsafe integer overflow and duplicate source credits fail closed.
- PCC-R19: Policy V1 converts 1 point to ARS 1 discount and caps redemption at the lesser of available points, 10% of eligible merchandise and 10,000 points per order, rounded down. It does not stack with manual or campaign discounts. The authenticated CUSTOMER explicitly selects points at checkout; quote, reserve and cancellation are customer commands. A quote reservation expires after 15 minutes. When a payment attempt is created it atomically becomes `PAYMENT_PENDING` and no longer expires by wall clock; it commits on authoritative approval and releases only on authoritative cancellation, rejection or failed order creation. Unknown provider outcome stays held for reconciliation, so a late approval never duplicates the benefit or creates a negative balance.
- PCC-R19A: `available = accepted credits - committed debits - active reservations - expired credits`. Reserve, commit, release and expiry serialize per customer ledger. Two reservations that jointly exceed available points cannot both succeed.
- PCC-R19B: earning entries expire 365 days after acceptance, oldest eligible points are consumed first, and expiry cannot consume an active reservation.
- PCC-R19C: returns use cumulative arithmetic per original order. `targetEarnReversal = floor(originalEarned * cumulativeEligibleReturned / originalEligibleBase)`, except a 100% return targets exactly all original earned points; each return records only the delta from prior reversals. The same cumulative-target/delta rule restores redeemed points and never exceeds the original redemption. If earned points were already spent, the return still completes and the uncovered amount becomes non-spendable `RECOVERY_PENDING`; balances never become negative and future earnings settle recovery first.
- PCC-R20: customer sees balance, expiry and history; administrator sees audited adjustment and reconciliation views. UI never prints an unknown raw state.

## Acceptance

1. Each slice demonstrates populated desktop and mobile states with deterministic synthetic fixtures.
2. All state/role/source/payment/transition vocabularies are closed domain types with one boundary translator and `Unknown`.
3. PostgreSQL tests prove migrations, idempotency, CAS/concurrency, immutable audit and tenant/realm ownership.
4. Browser tests cover success, empty, loading, error, stale data, permission denial and recovery.
5. StoreCore remains fully usable when BlackStore, SMTP and external providers are disabled.
6. No secret, live credential, personal identity or claim of external homologation is committed.
7. Numeric examples prove Policy V1: ARS 25,999 eligible earns 25 points; 800 available points on ARS 5,000 eligible can redeem 500; two concurrent reservations for 600 against 1,000 available yield one success and one insufficient-balance result. Two partial returns that together reach 100% reverse exactly all original earned points. A provider approval after the quote TTL still commits because the reservation was promoted to `PAYMENT_PENDING` before leaving checkout.

## Non-goals

- No live activation of BlackStore, SMTP, Mercado Pago, Mercado Libre, ARCA or Correo Argentino.
- No autonomous repricing, competitor scraping or hardcoded commercial campaign.
- No transferable token, cash withdrawal, peer-to-peer balance or crypto representation.
- No destructive rewrite of historic orders, payments, stock, returns or POS receipts.
- No BlackStore monetary aggregation until the separate commercial-facts contract is approved and implemented.

