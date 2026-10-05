---
name: master-capability-session-bound-administration
date: 2026-10-05
project_mode: brownfield
status: archived
---

# Capability administration bound to the authenticated session

Master-only hardening of the four capability administration operations through a
forward-only V10 migration and the matching JDBC caller contract.

V9 protects definer ownership, search path and PUBLIC privileges, but the runtime
still supplies an actor ID without proving a current USER session at mutation time.
This slice binds that actor to the authenticated principal's session and verifies
current authorization in PostgreSQL before effects.

V1–V9 are immutable. No Tx-C, BlackStore operational integration, aggregate
promotion from `integration/storecore-int`, live activation, deploy, tag or release.
Historical BlackStore schema remains untouched; its presence is not an activation.

Validated head: `c5926cb2b8618d6a025970dd9a6904e485de4777`.
GitHub Verify run `37337967180` passed backend and frontend. Two independent
GPT-6.1 Sol reviews approved that exact head with no P0–P3 findings. The archive
commit contains documentation only and must receive the same exact-head gates
before merge.

affected_specs:
  overrides: []
  extends:
    - sdd/wip/20261003-capability-definer-hardening/spec.md
    - sdd/features/20260921-single-tenant-installation-baseline/2-technical/adr/ADR-003-separate-user-customer-identity-and-opaque-sessions.md
  deprecates: []
