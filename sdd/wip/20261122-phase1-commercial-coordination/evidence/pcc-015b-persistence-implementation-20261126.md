# PCC-015B loyalty persistence implementation — 2026-11-26

## Status and exact boundary

PCC-015B is `in_progress`. This record starts a test-first persistence foundation after PCC-015A merged and its hosted closeout merged. It does not claim tests, reviews, CI, merge or completion until those results are recorded below.

This cut may add wallet identity/revision, immutable admitted source applications, ledger movements, issued lots, current lot partitions, non-reservation allocation events, global loyalty command bindings, private receipts and audit. It does not add reservations, frozen reservation allocations, checkout/payment binding, earning projection, correction/recovery persistence, HTTP, UI, scheduler or provider activation; those remain PCC-015C through PCC-015F and PCC-016.

## Capability decision

The current installation capability keeps `LOYALTY` future-only and does not define the complete CUSTOMER/read/terminal action set. PCC-015B will not reinterpret `POST_LEDGER`, change capability to `ACTIVE`, register a production Spring bean/controller or grant a generic privileged writer that accepts caller-invented source effects. PostgreSQL and JDBC behavior is exercised through explicit test fixtures and direct adapter construction only. Operational ADMIN adjustment remains unavailable until its exact capability/action contract is reviewed.

## Persistence decisions

- The first candidate migration is V41, reconfirmed unused on master `185c5864e21377bd85efab8c2a50aa921c335d4e`; published V1 through V40 remain unchanged.
- Wallet identity belongs to one CUSTOMER and owns a non-negative revision, not a mutable authoritative balance.
- Source applications, ledger entries, issued lots, allocation events, command bindings, receipts and audit are append-only evidence.
- Current lot partitions are protected projections. Conservation is checked with numeric-wide arithmetic before conversion to signed Long values.
- Loyalty command UUID identity is global within the loyalty domain. Reuse with another realm, actor, operation, aggregate or canonical hash is a conflict.
- Runtime receives no direct mutation grant over evidence or projections. Any future privileged writer must be narrow, fix its search path, revalidate authority and derive rather than trust effects.
- Reservation/order/payment/correction foreign keys and empty placeholder tables are forbidden in this cut.

## Planned RED/GREEN matrix

1. Clean PostgreSQL 16 install and V40-to-V41 upgrade preserve published checksums and existing data.
2. Constraints reject USER ownership, duplicate CUSTOMER wallets, unknown states, invalid magnitudes, cross-wallet lots and non-conserved partitions.
3. Runtime cannot insert/update/delete/truncate immutable evidence or mutate protected projections; PUBLIC receives no privileged execution path.
4. Strict Kotlin translators reject future/unknown/corrupt persisted state as a complete unavailable wallet, never a partial balance.
5. Command identity, immutable historical receipts, source uniqueness, aggregate overflow and revision exhaustion are covered by deterministic tests.
6. Concurrent wallet creation and duplicate source/command identities converge without `SELECT missing -> INSERT` races.
7. Focused persistence/domain suites, affected schema assertions, repository hygiene and the backend suite are repeated before review.

## Evidence log

- Planning review: two independent GPT-6.1 Sol medium lanes converged on the non-operative foundation boundary, V41 availability, global loyalty command namespace, narrow grants, numeric-wide conservation and explicit exclusion of PCC-015C through PCC-015F.
- Kotlin domain RED/GREEN:
  - Missing persistence types failed compilation, then the focused suite passed 8 tests.
  - Realm/operation and receipt-revision invariants produced 2 expected failures, then passed 10 tests.
  - Four absent evidence factories produced the expected RED, then passed 4 tests.
  - Malformed UTF-16 fingerprint/source identifiers produced 2 expected failures; the identical expanded command then passed 39 tests, including the pre-existing loyalty and architecture suites.
  - The PCC-015B source whitelist was tested RED first because Kotlin still admitted `REDEMPTION`/`LOYALTY_CORRECTION`; after closing it to `PAYMENT_ACCREDITATION`, `ADMIN_ADJUSTMENT` and `EXPIRY`, the same focused command passed 4/4.
- PostgreSQL V41 RED/GREEN:
  - The clean-install test expected V41 and observed V40 before the migration existed.
  - Clean PostgreSQL 16 and V40 upgrade passed with published V1-V40 history/checksums preserved, LOYALTY still `future_optional`/`DISABLED`, append-only evidence, numeric-wide conservation and runtime SELECT-only grants.
  - A strict pre-review found that per-row event checks did not close aggregate ledger allocation or projection/evidence consistency. A second RED matrix recorded 12 missing rejections. Five deferred constraint triggers then closed the ledger and lot projections at commit; the same suite passed 4/4, including concurrent wallet, source and command UUID races with latches rather than sleeps.
  - Nine affected schema classes passed 38 tests after the V41 latest-version update.
  - Six integration suites whose upgrade assertions moved from latest V40 to latest V41 passed 95 tests with zero failures, errors or skips.
  - `ArchitectureBoundaryTest` passed 2/2 after the infrastructure adapter was added; domain and application remain free of framework/HTTP dependencies.
- JDBC adapter RED/GREEN:
  - The absent adapter failed compilation, then an explicit TODO adapter produced 9 expected PostgreSQL errors.
  - The read-only adapter passed 9 PostgreSQL tests as `storecore_runtime`: one-statement wallet/lot reads, fail-closed translation, exact-boundary expiry, no DML privileges, private realm/actor-bound receipt lookup and historical receipt replay.
  - Receipt snapshot JSON is schema version 1 with exact keys and canonical string magnitudes/IDs. The decoder reconstructs domain state through the same strict translator and never consults the current wallet for a historical result.
  - After deferred closure was added, adapter fixtures were made atomic and the final combined domain/migration/adapter command passed 50 tests with zero failures, errors or skips.
- No Spring bean, controller, HTTP route, writer, capability promotion or runtime mutation grant was added.
- Exact-head reviews: pending.
- Hosted CI and merge: pending.
