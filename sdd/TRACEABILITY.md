# RTM canónica — `storecore-core-v1.0.0`

**Estado:** archivado en `sdd/features/20260921-single-tenant-installation-baseline/`. PR #14. TODO-041 in-repo: official refetch port + CI fake. Live vendor HTTP is installation-configured, never in CI.

| Capacidad | Core/tarea o feature | Gate |
|---|---|---|
| instalación single-tenant y perfil | TASK-002,003,012 | sin tenant routing; import preview/merge/version compatibility |
| storefront producción, catálogo/search/brand/category/offers/home | TASK-005 | HTTP repository, contenido configurable y búsquedas verificables |
| customer/profile/address/auth | TASK-004 | identidad y autorización separadas |
| cart/checkout/pago/order | TASK-006 | snapshots, idempotencia y estados |
| Mercado Pago live checkout | `20260922-storecore-mp-live-checkout-v1` | 01–04 fail-closed cerrado (Sol + dual Grok); 05 NO-GO; WIP no archivado |
| stock WEB | TASK-007 | reserve/consume/release y ledger append-only |
| ML autorizado | TASK-008 + TODO-041 | contrato oficial, cuenta autorizada, inbox durable→ACK; refetch/apply via port (CI fake) |
| admin catálogo/contenido/promo manual | TASK-009 | roles, auditoría, margen y único writer |
| fulfillment manual/returns | TASK-010 histórico + WIP `20261006-commerce-closed-states-and-fulfillment-eligibility` | código local exige pago/stock verificados; sólo recepción sin stock; inspección/restock diferidos TODO-045. Runtime/review del corte abiertos |
| profile/fixture prototype/fleet docs | TASK-012 | no mezcla de prototype con producción |
| quality/release | TASK-013..015 | dependencias completas + Sol GO/NO-GO |
| frontend UX Stitch | `sdd/wip/20260923-storecore-frontend-ux-system-v1/` + `docs/agent/frontend/` | Views DS-00…U-10 en código; SDD visual + HTML archivado; Stitch `6473866243657965808`; axe `npm run test:a11y` |
| `ml-competition-insights` | TODO-030 deferred | señales oficiales read-only; no scraping/top-5 |
| `ml-price-automation-management` | TODO-031 deferred | opt-in, min/max/margin/cooldown/audit/kill switch; writer exclusivo |
| `ml-promotion-orchestrator` | TODO-032 deferred | oferta oficial, eligibility/preflight, approval/preauth, rollback/reconcile |
| `web-cross-sell-discounts` | TODO-033 deferred | relation/eligibility/stacking/priority/margin/snapshot/reversal |
| `commercial-calendar` | TODO-034 deferred | events/campaigns configurables, timezone/preflight/kill/rollback |
| ML virtual kits | TODO-035 deferred | feature separada, sin inferencia en catálogo core |
| favorites/loyalty/carriers | TODO-036..038 deferred | sin DDL/tarea core |
| fiscal externo | TODO-020 deferred; `20260921-arca-fiscal-discovery`; `20260921-arca-storecore-adapter-contract` | D-01..D-07 + SC-01..SC-07 + Sol GO; sin DDL/tarea StoreCore |
| POS ingest inventario | `20260921-pos-sales-ingestion` | **superseded** para companion; no GO |
| Contrato POS v1 | `20260921-storecore-pos-integration-contract-v1` | OpenAPI canónico `/blackstore-integration/v1`. PIC-001..010 y L3 locales done: HTTP 200/304/409/410/429 en Testcontainers, V7 deja `future_optional=false` y el módulo `DISABLED`, outbox local PIC-009. Companion live, fiscal y `/sdd.finish` NO-GO |
| POS BlackStore | repo `BlackStore` | ADP-001..010 + L3 locales en `master` (PR #1). Release disabled. Companion live NO-GO |
| acceso visual unificado, identidades separadas | `sdd/features/20261003-unified-access-entry/` — UA-001..008 | PRs #165–#169; `/login`, challenge 120 s one-use, home USER por rol, logout aislado; Verify #169 `37526296154` 12/12 + dual GPT-6.1 Sol. HTTP legacy soportado; retiro diferido `TODO-043` |

CFE-R01–R08 → CFE-T01–T06: inventario, targets reales, evidencia local y
escenarios E01–E09 en el WIP. Ninguna tarea cerrada; pruebas unit locales no
sustituyen PostgreSQL/HTTPS/clean/upgrade ni reviews del head exacto.
