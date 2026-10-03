---
name: unified-access-entry
date: 2026-10-03
project_mode: brownfield
status: planned
---

# Unified access entry

Una única entrada visual de acceso para StoreCore, preservando realms, cookies,
CSRF, permisos y sesiones CUSTOMER/USER separados.

Scope: StoreCore only. BlackStore staff authentication is a later feature and
must not be inferred from StoreCore identity or browser headers.

affected_specs:
  overrides:
    - sdd/features/20260921-single-tenant-installation-baseline/1-functional/spec.md
    - sdd/features/20260921-single-tenant-installation-baseline/2-technical/spec.md
  extends:
    - sdd/features/20260921-single-tenant-installation-baseline/2-technical/adr/ADR-003-separate-user-customer-identity-and-opaque-sessions.md
  deprecates: []
