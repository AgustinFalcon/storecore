---
name: master-capability-session-bound-administration
date: 2026-10-05
project_mode: brownfield
status: planned
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

affected_specs:
  overrides: []
  extends:
    - sdd/wip/20261003-capability-definer-hardening/spec.md
    - sdd/features/20260921-single-tenant-installation-baseline/2-technical/adr/ADR-003-separate-user-customer-identity-and-opaque-sessions.md
  deprecates: []
