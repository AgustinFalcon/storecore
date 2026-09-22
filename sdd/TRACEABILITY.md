# RTM canónica — `storecore-core-v1.0.0`

**Estado:** archivado en `sdd/features/20260921-single-tenant-installation-baseline/`. PR #14. TODO-041 in-repo: official refetch port + CI fake. Live vendor HTTP is installation-configured, never in CI.

| Capacidad | Core/tarea o feature | Gate |
|---|---|---|
| instalación single-tenant y perfil | TASK-002,003,012 | sin tenant routing; import preview/merge/version compatibility |
| storefront producción, catálogo/search/brand/category/offers/home | TASK-005 | HTTP repository, contenido configurable y búsquedas verificables |
| customer/profile/address/auth | TASK-004 | identidad y autorización separadas |
| cart/checkout/pago/order | TASK-006 | snapshots, idempotencia y estados |
| Mercado Pago live checkout | `20260922-storecore-mp-live-checkout-v1` | Checkout Pro/Orders documental; MP-LIVE-02A política pura; 03/04/05 NO-GO |
| stock WEB | TASK-007 | reserve/consume/release y ledger append-only |
| ML autorizado | TASK-008 + TODO-041 | contrato oficial, cuenta autorizada, inbox durable→ACK; refetch/apply via port (CI fake) |
| admin catálogo/contenido/promo manual | TASK-009 | roles, auditoría, margen y único writer |
| fulfillment manual/returns | TASK-010 | state machine e inspección antes de restock |
| profile/fixture prototype/fleet docs | TASK-012 | no mezcla de prototype con producción |
| quality/release | TASK-013..015 | dependencias completas + Sol GO/NO-GO |
| frontend UX Stitch | `docs/agent/frontend/` | DS-00…U-10 en código; axe en `npm run test:a11y` |
| `ml-competition-insights` | TODO-030 deferred | señales oficiales read-only; no scraping/top-5 |
| `ml-price-automation-management` | TODO-031 deferred | opt-in, min/max/margin/cooldown/audit/kill switch; writer exclusivo |
| `ml-promotion-orchestrator` | TODO-032 deferred | oferta oficial, eligibility/preflight, approval/preauth, rollback/reconcile |
| `web-cross-sell-discounts` | TODO-033 deferred | relation/eligibility/stacking/priority/margin/snapshot/reversal |
| `commercial-calendar` | TODO-034 deferred | events/campaigns configurables, timezone/preflight/kill/rollback |
| ML virtual kits | TODO-035 deferred | feature separada, sin inferencia en catálogo core |
| favorites/loyalty/carriers | TODO-036..038 deferred | sin DDL/tarea core |
| fiscal externo | TODO-020 deferred; `20260921-arca-fiscal-discovery`; `20260921-arca-storecore-adapter-contract` | D-01..D-07 + SC-01..SC-07 + Sol GO; sin DDL/tarea StoreCore |
| POS ingest inventario | `20260921-pos-sales-ingestion` | **superseded** para companion; no GO |
| Contrato POS v1 | `20260921-storecore-pos-integration-contract-v1` | OpenAPI canónico `/blackstore-integration/v1`; D-TTL/D-CURSOR/D-RATE/D-PATH cerrados; `ready_for_sol_review` no approved |
| POS BlackStore | repo `BlackStore` WIP `blackstore-pilot` | ticket/caja; conector real bloqueado hasta GO del contrato v1 |
