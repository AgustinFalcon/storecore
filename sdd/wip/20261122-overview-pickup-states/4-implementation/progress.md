# Progreso

- 2026-11-22: corte creado como prerrequisito de DATA-04; no acredita pagos ni activa proveedores.
- 2026-11-22: backend reconoce `READY_FOR_PICKUP` como trabajo activo y `PICKED_UP` como terminal válido; frontend traduce el wire mediante el tipo cerrado `OverviewShipmentState`.
- 2026-11-22: `OverviewClosedTypesTest` y `OverviewHttpIntegrationTest` pasan contra PostgreSQL 16 real (6 pruebas, 0 fallos); el fixture fija margen temporal para eliminar deriva entre relojes JVM/DB.
- 2026-11-22: repositorio HTTP Angular cubre el mapeo de retiro listo (7 pruebas, 0 fallos). Pendientes: revisiones exact-head y CI del PR.
