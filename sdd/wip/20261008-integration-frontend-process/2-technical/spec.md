# Contrato técnico y ports manuales

## Línea base verificable

[App routes](../../../../frontend/src/app/app.routes.ts) y [manifest axe](../../../../frontend/e2e/route-manifest.ts) tienen 24 rutas hoja. [Axe](../../../../frontend/e2e/a11y.spec.ts) instala fixtures HTTP: cubre pantallas cargadas, no wiring Spring/DB. [Workflow Verify](../../../../.github/workflows/verify.yml) ejecuta backend y frontend, y a11y backend-less.

Existe [V20 capability retirement](../../../../backend/src/main/resources/db/migration/V20__capability_legacy_overloads_retirement.sql). No copiar V11 UA del linaje master ni modificar checksums V1..V20. INT-FE-02 inventaría archivos, flyway_schema_history y ACL efectivas; reserva el siguiente número libre (candidato V21 sólo si sigue libre). Upgrade V20 → nuevo delta y clean install deben preservar POSC/DSP, grants y retirement de overloads. Sin flyway repair.

## Evidencia cerrada

- RealLocal: Angular real → HTTP Spring real → PostgreSQL aislado real; asserts de respuesta, readback y efectos durable. Sólo proveedor externo sustituible por loopback explícito. Guardar SHA FE/BE, origin/destino, DB, comando, salida, conteo, artifacts y resultado.
- MockHttp: browser intercept o HttpTestingController sustituye API; útil para Unknown, errores y UX. No prueba persistencia ni cookies del navegador.
- FixtureOnly: repository/DOM/datos locales, prototype DEMO o favoritos de pestaña. No cuenta para aceptación productiva.

El inventario describe implementación observada y clase de evidencia existente, no nuevos PASS. Cada ejecución se registra por modo; descubrimiento, ngc o unit no equivalen a bundle/E2E real.

## INT-FE-01 capability

El backend actual exige correlationId, expectedConfigVersion, reason y rota CSRF. UserHttpRepository envía sólo state y la UI no cubre el flujo de comandos; portear readmodel y command por allowlist, conservando module visibility de integración. Estados/module/resultado/acciones cerrados; payload desde tipo, conflicto stale → GET autoritativo; timeout → consultar comando y no duplicar efectos. No activar companion por actualizar la consola.

INT-FE-01 local corrige este gap observado en el baseline: payload con UUID/versión/motivo, dominio cerrado y Unknown, ADMIN en UI y backend, consulta de correlación + snapshot autoritativo ante error/timeout. Versión esperada positiva y motivo no vacío obligatorios en HTTP; no resolver versión implícita del cliente. [Evidencia del port](../4-implementation/int-fe01-capability.md), con gate RealLocal pendiente.

## INT-FE-02/03 Unified Access

Fuente revisable #176: `9a305b940b24d68c6bb80108060996b6210546a5`, rama `fix/unified-access-context-hardening`. El contrato fuente está archivado en `sdd/features/20261003-unified-access-entry/` (no en wip en ese SHA). Fuente histórica backend #166, frontend #167 y E2E #169; revalidar SHA/diff antes de portear.

Port manual de dominio/application, challenge store/controller, wiring/login/guards/coordinator y pruebas; ningún agregado general de master. Endpoints fuente POST /api/v1/auth/login y /context-selection. Tabla challenge forward-only en siguiente versión libre. No colisionar master V11 con integración V11. Mantener rate limiter realm-budget/top5, auditoría, sesión vinculada a capability y Origin.

Preservar home blocks, ofertas, favoritos de pestaña hasta reemplazo productivo, inventory sealed, Unknown fail-closed, cancellation/detail identity y session mutation reconciliation. #176 agrega fences de revoke/login, logout frío coalescido, limpieza actor A→B y CustomerCartAccess cerrado. Cookie Set-Cookie race requiere browser real; mocks no la acreditan. UA no fusiona identidades.

### INT-FE-03: contrato frontend sobre backend portado

Addendum INT-FE-03 sobre `b8bd49018413a503f5af8d04aa64b1dc36263f04`:
INT-FE-02 ya agrega endpoints UA y `V21__unified_access_challenges.sql`;
las menciones anteriores a migración futura describen el baseline original.
El frontend UA aún no está portado. [Contrato del corte](../4-implementation/int-fe03-unified-access-frontend.md)
fija allowlist, never-copy master, API/cookies verificadas, closed types,
interlock coordinator/SessionMutationQueue/CSRF y A01–A09. No nueva migración.
El runner futuro será UA-only y aislado de CFE; conservar rate budget backend y
un solo host loopback por escenario. No declarar aceptación desde mocks.

## INT-FE-04 CFE: alcance posterior

Procedencia #171/#173: `a653f45af977ad989b62a48ec01a363646207aaf` y WIP `20261006-commerce-closed-states-and-fulfillment-eligibility`. Port manual de tipos, política/evidencia/records, callers, consumers y acceptance. Mantener hooks BlackStore/DSP/lock order e inbox/SALE existentes. No transportar migraciones master ni reemplazar todo JdbcCartService/JdbcOrderService.

- E01: checkout pendiente; ship/RMA/CUSTOMER rechazados sin efectos.
- E02: estados bloqueados/Unknown, pago ausente/ambiguo, monto/moneda/evidencia ajena; cero efectos. Unknown imposible por constraints usa MockHttp/unit, claramente separado.
- E03: puerto proveedor fake → inbox/worker real → acreditación/SALE → PACKED/SHIPPED/DELIVERED; respuesta y DB, eventos/fechas y reload.
- E04: reserva vencida/re-reserve con variante/cantidad exactas; consumo parcial/excedido y PAID_STOCK_REVIEW bloqueados.
- E05: dos operadores/replay/fuera de orden y RMA antes de entrega; único efecto.
- E06: carreras pago/reversión/terminación, rollback tras primer write, timeout+GET+retry, lock order y CSRF.
- E07: RMA único/cantidades originales; INSPECTED/ADJUSTED rechazados incluso históricos; stock/ledger sin cambios.
- E08: sesión, rol, capability disabled/read-only, CSRF, Origin y ownership negativos.
- E09: Flyway clean/upgrade con checksums intactos y Angular HTTPS → Spring → PostgreSQL, reload real sin intercept de aceptación.

## INT-FE-05/06 ofertas y favoritos

OfferHttpRepository sólo implementa list/save; backend tiene POST /user/offers/{id}/status. Completar comandos con estado cerrado y contrato de aprobación/autoridad existente, refresh y errores seguros; assertions catálogo/carrito/snapshot/DB, sin convertir promos MANUAL en offers.

Favoritos no tienen endpoint ni tabla en esta base. Antes del código INT-FE-06 redacta mini-SDD con endpoints, límites, ownership, unicidad CUSTOMER+SKU, borrado y tratamiento de producto inactivo, migración libre y pruebas. El endpoint propuesto no debe inventariarse como existente. Repositorio HTTP, use cases y tipos antes de view/store; localStorage/sessionStorage no sustituye DB.

## Gates

Por corte: revisar allowlist/diff, arquitectura/lint/unit/build FE, backend mvn test según riesgo, Flyway clean+upgrade al tocar migraciones, tests focales HTTP/DB y diff-check. Gate final: suites completas, manifest/runtime exacto, axe 24 rutas actuales más las nuevas, E2E RealLocal de acciones nuevas y regresiones de integración. Si hosted CI falla por infraestructura o cuota, registrar BLOCKED y seguir validación local autorizada; nunca declarar CI verde ni omitir gate de merge. INT-FE-00 sólo valida documentación/JSON/links/DAG, sin ejecutar suite de producto.
