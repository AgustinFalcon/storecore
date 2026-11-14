# Progreso y cierre de revisión

## Implementación

- Base histórica: `d60451bf40e29365c2bdf9defe0f35db78edd7a2`.
- Estado reconciliado contra `master`:
  `dc45c5942009d0f80eaf252054a54b8f51182f22`.
- El corte conserva contratos tipados, estados cerrados, autorización,
  Origin/CSRF, exclusión de doble envío y reglas transaccionales de stock.

## Reviews exact-head — 2026-11-14

Dos revisores GPT-6.1 Sol independientes emitieron `APPROVE` sobre
`dc45c5942009d0f80eaf252054a54b8f51182f22`, sin hallazgos P0–P3.

La revisión funcional verificó el draft de catálogo, repositorio HTTP,
servicio backend y tipos cerrados. La revisión técnica/seguridad verificó que
el stock sólo se envía para variantes nuevas, que el backend rechaza stock en
variantes persistidas, que las colisiones de SKU se rechazan dentro de la
transacción y que la mutación exige rol/capability, Origin y CSRF.

## Límite de evidencia

`frontend/e2e/admin-catalog-product-creation.spec.ts` intercepta `/api/v1/`
mediante `route.fulfill`. Es evidencia de interacción Angular y del cuerpo
serializado, no de persistencia PostgreSQL, autenticación real, ledger,
rollback o concurrencia. `CatalogStockIntegrityTest` cubre servicio y
PostgreSQL por separado. No se afirma un E2E navegador → backend → base para
este editor.

Un intento retrospectivo de repetir tres specs frontend focales no llegó a
ejecutar tests por una restricción de acceso del sandbox/esbuild. No se
registra como fallo funcional ni como gate verde; la aprobación se apoya en la
inspección exact-head y en los gates ya asentados en este SDD.
