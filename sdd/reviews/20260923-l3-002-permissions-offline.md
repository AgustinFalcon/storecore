VERDICT: APPROVED (isolated fail-closed)

# L3-002 — Permissions, offline contract, no cross-database access

**Scope:** PIC-001..009 fail-closed. Not live bearer traffic. Not PIC-010.

## Evidence

- `includeCost=true` on the catalog engine is 403 `COST_SCOPE_REQUIRED` (cashier must not see cost).
- Price override path is denied as line `PRICE_VERSION_MISMATCH` (engine does not waive stale/override).
- Companion guard `assertNoLiveTraffic` on HTTP deny; fail-closed HTTP test keeps operations and `EXTERNAL_BLACKSTORE` ledger at 0.
- No JDBC URL/host to BlackStore. Single application datasource in saga tests.
- HTTP 403 bodies omit PAN / `sk_live_` / `cvv` / `password=`.
- Catalog page carries `validUntil` (AC-OFF-1 StoreCore side). BlackStore offline block of new sales remains a companion obligation.

## Residual

Service bearer scopes are not exercised on HTTP while the module stays DISABLED. That is required by Sol, not a bypass. Do not treat this as production authorization proof.
