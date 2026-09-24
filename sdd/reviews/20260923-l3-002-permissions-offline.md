VERDICT: APPROVED (Testcontainers CAS temporary ACTIVE; not live)

# L3-002 — Permissions, offline contract, no cross-database access

**Scope:** Isolated + HTTP under Sol next-go. Not live bearer traffic.

## Evidence

- HTTP `includeCost=true` is 403 `COST_SCOPE_REQUIRED` while the module is temporarily ACTIVE.
- Price override path is denied as line `PRICE_VERSION_MISMATCH` (engine).
- Fail-closed HTTP test keeps operations and `EXTERNAL_BLACKSTORE` ledger at 0 while DISABLED.
- No JDBC URL/host to BlackStore. Testcontainers is ephemeral Postgres only.
- HTTP 403 bodies omit PAN / `sk_live_` / `cvv` / `password=`.
- Catalog page carries `validUntil`. BlackStore offline block of new sales remains a companion obligation.
- Reconcile burst returns 429 `RATE_LIMITED` with `Retry-After` without Apache retry hiding the first 429.

## Residual

Not production authorization. Service bearer tokens are still fixture-free. Do not treat this as live companion proof.
