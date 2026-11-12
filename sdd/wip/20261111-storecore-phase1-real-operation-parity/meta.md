# Paridad operativa real de Fase 1 — StoreCore

Estado: `IMPLEMENTED_LOCAL_GATES_PASSED_REVIEW_PENDING`.

Base: `d60451bf40e29365c2bdf9defe0f35db78edd7a2` (`origin/master`).

Objetivo: cerrar las acciones locales de Fase 1 que la interfaz productiva muestra,
usando contratos HTTP reales. La homologación y los conectores de terceros quedan
fuera de este corte y se mantienen fail-closed.

Evidencia local:

- `npm run verify`: arquitectura, lint, 175 archivos / 1172 tests y build verdes.
- `npm run test:a11y`: 67 flujos Playwright verdes.
- `CatalogStockIntegrityTest`: 4 tests con PostgreSQL real verdes.

