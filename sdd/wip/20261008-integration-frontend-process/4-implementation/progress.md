# Evidencia INT-FE-00 — 2026-10-08

Actualización INT-FE-01: [port manual capability y evidencia local](int-fe01-capability.md). Implementación local con gates externos/RealLocal pendientes; el registro INT-FE-00 debajo conserva su alcance documental original.

Actualización INT-FE-02: [port manual Unified Access backend](int-fe02-unified-access-backend.md) sobre 999d5c8. V21 nuevo con V1..V20 intactos, tests unit/controller locales y tests HTTP/JDBC/upgrade compilados. Docker local inaccesible: PostgreSQL/ACL/Flyway real NOT_RUN; gates de DB, reviews, CI JDK17 y frontend permanecen pendientes.

Worktree nuevo desde dfaeba0883a1073b185abaf336b63d5d6bdc5d54; rama integration/storecore-frontend-process. Inventario por lectura de app.routes.ts, route-manifest.ts, a11y.spec.ts, repositories, controllers, migraciones y Verify. Sin código productivo, DDL, push, PR, deploy o activación.

Hallazgos reproducibles: 24 rutas; favoritos son sessionStorage en una pestaña; ofertas HTTP list/save carecen del comando status que expone backend; capability state FE envía sólo state frente al contrato BE correlación/versión/motivo; V20 existe y los textos históricos V20-libre no aplican al head.

Fuentes UA #176 9a305b940b24d68c6bb80108060996b6210546a5 (features archivado) y CFE #173 a653f45af977ad989b62a48ec01a363646207aaf se inspeccionaron desde objetos Git locales. Esto verifica procedencia documental, no PASS de ejecución en integración.

Validación ejecutada de este corte: Node leyó los tres JSON, recorrió por DFS las ocho tareas y sus dependencias, comparó los 24 patrones únicos con frontend/e2e/route-manifest.ts, comprobó cobertura INT-R01..08 y resolvió los 13 enlaces relativos del WIP. Resultado: PASS (json=3, links=13, tasks=8, routes=24, requirements=8). git diff --check: PASS. El SHA de commit se reporta al principal sin auto-referencia en este documento. Backend/frontend/E2E del producto: NOT_RUN (diff documental). CI/reviews exact-head y homologación externa: no acreditados.
