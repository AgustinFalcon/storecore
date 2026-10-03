# Capability administration definer hardening

## GO and scope

User authorized completing core hardening for homologation and GPT-6.1 Sol reviews.
Repair the inherited privileged PostgreSQL function boundary without changing HTTP,
domain states, audit semantics, or activating external integrations.

## Finding and acceptance

Published V3 grants PUBLIC execution to four SECURITY DEFINER functions and leaves
pg_temp implicit, so temporary identity tables can precede public relations during
resolution. V8 only protects its two new module-bound overloads.

V9 must preserve V1-V8 checksums, explicitly order pg_catalog, public, pg_temp on all
six administration signatures, revoke PUBLIC execution and retain explicit runtime
execution. Owner remains storecore_migrator. Runtime callers still need a real
active administrator in public identity tables; forged temporary roles fail closed.

## Verification

- Fresh installation: CapabilityTask003Test runs all migrations, existing authorized
  lifecycle tests and new change/create temp-table authorization regression.
- Upgrade: CapabilityDefinerMigrationTest applies published V8 then V9; catalogs
  prove all six signatures keep definer ownership, safe path, runtime execution,
  and no PUBLIC execute grants.
- External homologation ARCA/Correo and companion activation remain pending.
