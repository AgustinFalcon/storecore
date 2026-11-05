# SC-SURF-22 Real — inventario de sólo lectura, 2026-10-27

Base del corte: `4ba1af0`. Evidencia de implementación local; no equivale a aprobación visual, homologación ni aceptación de backend real.

## Alcance

La ruta `/user/inventory` usa un store dedicado al read model `listInventory` y actualiza su actor desde la sesión interna. Búsqueda por SKU y filtros de disponibilidad usan tipos cerrados. El resumen representa todas las filas de la consulta; el listado informa cuántas coinciden. Disponible se presenta sin descontar reservas nuevamente. Una cantidad ausente permanece no informada, incluyendo su total; no se infieren físico, condición, Outlet ni movimientos.

La vista cubre carga inicial, actualización conservando la última consulta, error inicial con reintento, error de actualización con advertencia de datos anteriores, acceso denegado, estado de lectura desconocido, inventario vacío y filtro sin coincidencias. No contiene comandos de ajuste, reconciliación ni historial. Tabla de escritorio y presentación por tarjetas a 390 px conservan etiquetas, foco visible y controles de 44 px.

## Pruebas agregadas

- `user-inventory.view.spec.ts`: totales autoritativos, filtro y búsqueda combinados, cantidades desconocidas, carga/refresco/error obsoleto, limpieza, acceso denegado y Unknown sin exposición del snapshot.
- `e2e/admin-inventory.spec.ts`: ADMIN/OPERATOR, respuestas HTTP interceptadas, filtros, sólo GET de inventario, recuperación de error/vacío/403 y reflow con axe a 390/768/1440. Genera capturas por viewport al ejecutarse.

## Ejecución y límites

- `npm run verify`: PASS — arquitectura, lint, 57 archivos / 295 tests y build de producción.
- `npx playwright test e2e/admin-inventory.spec.ts`: PASS — 6/6 escenarios en paralelo, con axe y capturas a 390/768/1440.
- La revisión visual corrigió el caption compacto y usa tarjetas hasta 840 px para evitar quiebres de palabras en tablet; las capturas finales de 390/768/1440 se inspeccionaron nuevamente.
- La rehidratación de sesión ya no duplica lecturas: el store informa el cambio efectivo de actor antes de disparar el GET.
- La actualización con snapshot usa el estado cerrado `Refreshing`; error inicial, stale y acceso denegado permanecen casos separados.

Los E2E agregados usan HTTP simulado de forma explícita. No prueban PostgreSQL/Spring, autenticación real, persistencia ni integración operativa con proveedores. La aceptación final queda sujeta a revisión del diff exacto y CI del PR; ningún resultado de una rama histórica se reutiliza como validación del corte actual.
