# Evidence Index

## SDD Baseline Audit — 2026-09-21

- Scope: `storecore-core-v1.0.0` en `sdd/wip/20260921-single-tenant-installation-baseline/`, gobierno y docs agent derivados.
- State: core single-tenant `ready_for_sol_review`; `sdd-v1.0.0` es baseline documental, no tag/release.
- Capability evidence: storefront productivo, catálogo/search/brand/category/offers/home, cart/checkout, customer/profile/address, orders/manual fulfillment, stock WEB, ML autorizado y administración manual están en scope. Prototype es separado.
- Plan evidence: 14 tareas ejecutables: 11 L1 y exactamente 3 gates L3; POS, fiscal, intelligence, price automation, promotions, cross-sell, calendar, favorites, loyalty, carriers y virtual kits están diferidos.
- Data evidence: sin `store_id`, `store_hosts`, POS ni persistencia fiscal; secretos son referencias opacas.
- Validation evidence: valida estructura/conflictos, no Sol GO. No autoriza código, import, ML write, emisión fiscal, release o tag.
