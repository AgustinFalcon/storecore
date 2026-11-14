# Paridad operativa real de Fase 1 — StoreCore

Estado: `IMPLEMENTED_REVIEW_APPROVED_RECONCILED`.

Base: `d60451bf40e29365c2bdf9defe0f35db78edd7a2` (`origin/master`).

Objetivo: cerrar las acciones locales de Fase 1 que la interfaz productiva muestra,
usando contratos HTTP reales. La homologación y los conectores de terceros quedan
fuera de este corte y se mantienen fail-closed.

Evidencia local:

- `npm run verify`: arquitectura, lint, 175 archivos / 1173 tests y build verdes.
- `npm run test:a11y`: 67 flujos Playwright verdes.
- `CatalogStockIntegrityTest`: 4 tests con PostgreSQL real verdes.

Reconciliación retrospectiva (2026-11-14):

- dos revisiones independientes GPT-6.1 Sol aprobaron el head exacto
  `dc45c5942009d0f80eaf252054a54b8f51182f22` sin hallazgos P0–P3;
- el smoke Playwright de alta de catálogo prueba la interacción Angular y el
  contrato serializado con HTTP simulado; no acredita por sí solo un recorrido
  navegador → Spring → PostgreSQL ni los controles reales de autenticación,
  CSRF, ledger o concurrencia;
- la cobertura backend y PostgreSQL registrada arriba permanece como evidencia
  separada y no se presenta como E2E de navegador.

