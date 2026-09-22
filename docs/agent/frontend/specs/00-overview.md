# Specs de UI — StoreCore

Plan frontend del core `storecore-core-v1.0.0`. Patrón AssistTime `release/1.4` empleados:

`Component → Store → UseCase → IRepository → HTTP`

| Tarea | Superficie | Estado frontend |
|---|---|---|
| TASK-001 | Shell, tokens, health HTTP | Hecho |
| TASK-004 | Registro/sesión/perfil/direcciones customer; sesión user | Hecho |
| TASK-005 | Home, búsqueda, filtros, detalle; admin catálogo+marcas+categorías+imágenes+contenido | Hecho |
| TASK-006 | Carrito snapshot, qty, checkout con entrega/moneda + Reintentar, órdenes | Hecho |
| TASK-007 / 008 | Inventario WEB read-only y mapa ML | Hecho en UI (HTTP). TODO-041 worker+fake in-repo; live ML/MP credentials per installation, no CI |
| TASK-009 | Promos manuales admin (currency, vigencia, prioridad, margen, aprobador) | Hecho |
| TASK-010 | Fulfillment / RMA sin saltos + tracking | Hecho |
| TASK-012 | Preview/merge de perfil versionado; secretos bloqueados | Hecho |
| TASK-013..015 | Reviews de calidad | Fuera de este frontend |
| Hardening API | Mappers, validación, 401, login navigate | Hecho |

Prohibido: fixtures, Universal Tools hardcodeado, `store_id`, BlackStore, fiscal, credenciales reales.

Inventario UX (todas las pantallas): `docs/agent/frontend/screens.md`.
Prompt de diseño (copiar a la IA de UX): `docs/agent/frontend/ux-design-prompt.md`.
Handoff de pantallas: `docs/agent/frontend/ux-handoff.md`.
Contrato: `docs/agent/frontend/http-contract.md`.
