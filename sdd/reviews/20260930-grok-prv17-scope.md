VERDICT: APPROVED

# Grok 4.7 — POSC-003A scope (code)

**Lane:** SCOPE  
**Feature:** POSC-003A — catalog revision singleton, writer triggers, audit port  
**Base:** `923c29a` (`Merge pull request #74 … POSC-003 catalog spec`)  
**Branch:** `feature/posc003a-catalog-revision`  
**Reviewed tree:** working tree at review time (uncommitted): `V11__posc003a_catalog_revision.sql`, `Posc003aCatalogRevisionTest.kt`, plus honest 002F version-list bump and SDD pointer edits  
**No merge.** This file does not approve GitHub, does not call hosted Verify CI green, and does not authorize `/sdd.finish`.

## Scope IN — judged

| Item | Result |
| --- | --- |
| V11 Flyway: revision singleton | PASS. `blackstore_catalog_revision` singleton (`id=1 CHECK`, `revision>0`), seed row, owner `storecore_catalog_revision_owner`. Does not edit V1–V10. |
| Writer triggers | PASS. `BEFORE INSERT OR UPDATE OR DELETE` on `products`, `product_variants`, `product_images`, `offers`, `offer_products`, `installation_settings`. No trigger on `inventory_balances`. |
| `blackstore_bump_catalog_revision()` | PASS. `SECURITY DEFINER`, `search_path=pg_catalog, pg_temp`, owner `storecore_catalog_revision_owner`; `UPDATE … SET revision=revision+1 WHERE id=1` with `NOT FOUND` guard; returns `OLD`/`NEW` correctly on DELETE. |
| `blackstore_catalog_revision_share()` | PASS. `SECURITY DEFINER`; `SELECT revision … FOR SHARE` via definer owner so runtime need not hold direct `UPDATE` on the singleton. |
| `storecore_blackstore_audit_override()` | PASS. Whitelist `BLACKSTORE_PRICE_OVERRIDE` and `BLACKSTORE_CATALOG_SKU_EXCLUDED`; payload object check; rejects `bearer`/`secret`/`secret_ref`; owner `storecore_blackstore_audit_owner`; runtime cannot `INSERT` into `audit_events` directly. |
| PG16 tests (`Posc003aCatalogRevisionTest`) | PASS (local evidence recorded). Five focused tests: checksum pin, clean upgrade to V11 with BLACKSTORE DISABLED, writer bump / stock no-bump, rollback hygiene, runtime ACL + audit port, share-vs-writer lock ordering. |
| Honest 002F version list 1–11 | PASS. `Posc002fAcceptanceMatrixTest` renamed assertion and expects Flyway versions `1`…`11` after full migrate. |

## Scope OUT — confirmed absent

| Item | Result |
| --- | --- |
| 003B–E (`catalogVersion`/`priceVersion`, HTTP, H2, `PriceQuotePort`) | PASS. No Kotlin production code, no new HTTP handlers, no H2 hash, no quote port. |
| Activating `BLACKSTORE_INTEGRATION` | PASS. V11 header comment and both upgrade tests assert module stays `DISABLED`. |
| `sdd.finish` | PASS. Not invoked; STATUS only records 003A branch pointer. |
| YAML digest re-pin | PASS. Untouched. |
| Grant `INSERT(variant_id)` | PASS. 002F residual assertion unchanged (`has_column_privilege … INSERT` = false). |
| ML RR | PASS. 002F still checks slices doc for separate ML RR NO-GO gate. |

## ACL and grants

- **No `GRANT ALL` to `storecore_runtime`.** Runtime receives `SELECT` on `blackstore_catalog_revision`, `EXECUTE` on bump/share/audit functions only. `GRANT ALL ON public.blackstore_catalog_revision TO storecore_migrator` and sequence grant to migrator follow prior V8–V10 pattern.
- **Singleton mutation blocked for runtime.** `REVOKE INSERT, UPDATE, DELETE ON public.blackstore_catalog_revision FROM PUBLIC, storecore_runtime`.
- **Audit path closed.** `REVOKE ALL` on audit override from `PUBLIC`, `storecore_companion_admin`, `storecore_capability_admin`; audit owner gets scoped `INSERT, SELECT` on `audit_events` + sequence usage only.
- **SKU event type.** Test inserts `BLACKSTORE_CATALOG_SKU_EXCLUDED` with aggregate `CATALOG_REVISION`; rejects `OTHER_EVENT` and secret-bearing `BLACKSTORE_PRICE_OVERRIDE` payload.

## Lock order (share vs trigger UPDATE)

- Writer path: catalog DML → `BEFORE` trigger → `UPDATE blackstore_catalog_revision` (row-exclusive) → catalog row change completes in the same transaction. Rollback test proves revision does not stick after abort.
- Reader path: `FOR SHARE` on singleton (directly in lock test; via `blackstore_catalog_revision_share()` in ACL test) is compatible with concurrent `inventory_balances` writes (no revision trigger).
- **Inversion guard:** `shareThenBalanceUpdateDoesNotInvertAgainstWriter` holds `FOR SHARE`, starts a product writer (blocked on revision bump), updates stock without deadlock, commits, writer completes. Matches the 003A SQL-only lock contract: share stabilizes revision; static writers wait; stock does not participate in revision locking.
- Full four-way PG16 scenario from the spec (WEB writer + GET + Tx-B + Tx-C capability) is **not** in this slice’s tests; it depends on HTTP/Tx-B handlers from later slices. Not treated as a P0 block for 003A merge.

## Validation

- V11 LF-normalized SHA-256 independently matches test pin `39CAEFFD984446407687A2A351A93EB892179DE39C022ABB74DE1302F7287DC1`.
- Parent agent recorded local `Posc003aCatalogRevisionTest` pass on PG16 Testcontainers. Hosted Verify was **not** treated as CI green (billing/spending-limit exception per repo rules).

## Non-blocking gaps (post-003A / later slices)

1. **Preflight SKU >64 audit emit** — audit port accepts `BLACKSTORE_CATALOG_SKU_EXCLUDED`, but no migration preflight or application emit yet; belongs to upgrade diagnostics / later catalog slices per proposal §24.
2. **Full concurrent deadlock matrix** — WEB + GET + Tx-B + Tx-C capability; requires 003C–E HTTP and saga paths.
3. **V11 checksum in 002F map** — 002F still pins V3–V9 only; 003A owns its own checksum test (consistent with prior slice split).

## Verdict rationale

003A delivers exactly the SQL revision/audit foundation with definer ownership, least-privilege grants, correct SKU audit event type, no `inventory_balances` trigger, and a focused PG16 harness. No P0 ACL leak, lock inversion in the tested share-vs-writer pattern, or scope creep into 003B–E. Slice is mergeable pending the paired SDD-lane review and dual-APPROVED gate before integration merge.
