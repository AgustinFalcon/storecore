---
name: unified-access-entry
date: 2026-10-03
project_mode: brownfield
status: archived
---

# Unified access entry

Una única entrada visual de acceso para StoreCore, preservando realms, cookies,
CSRF, permisos y sesiones CUSTOMER/USER separados.

Scope: StoreCore only. BlackStore staff authentication is a later feature and
must not be inferred from StoreCore identity or browser headers.

Completed: 2026-10-06. Implementation PRs #165–#169 culminate at StoreCore
`master` commit `99380a656562c784dc8fc4805eccc2a835a2ea48`. The public UX has
one `/login`; USER and CUSTOMER identity, authorization, cookies, CSRF and
sessions remain separate. The repository consumer inventory found supported
legacy HTTP credential consumers, so those endpoints are intentionally retained
and are not deprecated by this feature. Their possible future removal is
`TODO-043`, not an unfinished claim of this archive.

affected_specs:
  overrides:
    - sdd/features/20260921-single-tenant-installation-baseline/1-functional/spec.md
    - sdd/features/20260921-single-tenant-installation-baseline/2-technical/spec.md
  extends:
    - sdd/features/20260921-single-tenant-installation-baseline/2-technical/adr/ADR-003-separate-user-customer-identity-and-opaque-sessions.md
  deprecates: []
