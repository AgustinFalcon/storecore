# Evidencia INT-FE-00 — 2026-10-08

## Addendum INT-FE-04 documental — 2026-10-08

[Contrato CFE](int-fe04-commerce-fulfillment.md) preparado para review en rama
`integration/storecore-commerce-fulfillment-sdd`, worktree nuevo desde el SHA
FE03 exacto `41dcfb3ff099a4ca162c4c11fe75e4609826b1a8` (PR #181).
Sólo documentos de este WIP: backend-first, DTO/hints y tipos existentes,
retorno frío CustomerOrders, allowlist/no-touch, seguridad/actor/CSRF y PR
D → B → T → U → E. Ningún candidato local posterior se incorpora.

Inventario reconciliado por lectura del runtime: 24 hojas; `/login` y `/user/home`
reemplazan las antiguas hojas session, que ahora son redirects. La propuesta
histórica FE03 queda identificada como histórica; CFE no agrega rutas.

Validación documental ejecutada con Node y parser TypeScript de FE03: 3 JSON
parseados, enlaces relativos resueltos, DAG de 8 tareas y sub-DAG FE04 de 5 pasos
sin ciclos/dependencias ausentes, cobertura INT-R01..08 y igualdad exacta de
24 rutas entre AST de app.routes.ts, manifest axe e inventario. PASS documental;
git diff --check PASS. No instalación de dependencias ni ejecución de producto.
E01–E09, backend/frontend/browser/DB CFE: NOT_RUN. CI/reviews de este nuevo SHA
no acreditados. Sin push, PR, merge, release, deploy, master, live ni sdd.finish.
El SHA del commit se reporta fuera del documento para evitar auto-referencia.

## Registro histórico INT-FE-00..03

Actualización INT-FE-01: [port manual capability y evidencia local](int-fe01-capability.md). Implementación local con gates externos/RealLocal pendientes; el registro INT-FE-00 debajo conserva su alcance documental original.

Actualización INT-FE-02: [port manual Unified Access backend](int-fe02-unified-access-backend.md) sobre 999d5c8. V21 nuevo con V1..V20 intactos, tests unit/controller locales y tests HTTP/JDBC/upgrade compilados. Docker local inaccesible: PostgreSQL/ACL/Flyway real NOT_RUN; gates de DB, reviews, CI JDK17 y frontend permanecen pendientes.

Worktree nuevo desde dfaeba0883a1073b185abaf336b63d5d6bdc5d54; rama integration/storecore-frontend-process. Inventario por lectura de app.routes.ts, route-manifest.ts, a11y.spec.ts, repositories, controllers, migraciones y Verify. Sin código productivo, DDL, push, PR, deploy o activación.

Hallazgos reproducibles: 24 rutas; favoritos son sessionStorage en una pestaña; ofertas HTTP list/save carecen del comando status que expone backend; capability state FE envía sólo state frente al contrato BE correlación/versión/motivo; V20 existe y los textos históricos V20-libre no aplican al head.

Fuentes UA #176 9a305b940b24d68c6bb80108060996b6210546a5 (features archivado) y CFE #173 a653f45af977ad989b62a48ec01a363646207aaf se inspeccionaron desde objetos Git locales. Esto verifica procedencia documental, no PASS de ejecución en integración.

Validación ejecutada de este corte: Node leyó los tres JSON, recorrió por DFS las ocho tareas y sus dependencias, comparó los 24 patrones únicos con frontend/e2e/route-manifest.ts, comprobó cobertura INT-R01..08 y resolvió los 13 enlaces relativos del WIP. Resultado: PASS (json=3, links=13, tasks=8, routes=24, requirements=8). git diff --check: PASS. El SHA de commit se reporta al principal sin auto-referencia en este documento. Backend/frontend/E2E del producto: NOT_RUN (diff documental). CI/reviews exact-head y homologación externa: no acreditados.
# Addendum INT-FE-03 — 2026-10-08

[Contrato frontend A01–A09](int-fe03-unified-access-frontend.md) documentado para
review sobre `b8bd49018413a503f5af8d04aa64b1dc36263f04`, en worktree nuevo.
Sólo SDD: implementación y aceptación NOT_RUN. JSON/DAG/rutas/links y diff-check
validados; scripts de arquitectura sin ejecución efectiva por typescript ausente.
Sin cambios de frontend/backend, push, PR, merge o cierre.
