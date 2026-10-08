# INT-FE-03 — implementación frontend y evidencia local

Fecha: 2026-10-08. Rama local `integration/storecore-unified-access-frontend`.
Base exacta: PR #180 head `5c27e26` (INT-FE-02 + corrección CI + contrato FE03).
SHA frontend del código validado: `4ce98d51f9e4d326c8cc0cd3f195cbeec5a7ea9f`.
Backend heredado: `b8bd49018413a503f5af8d04aa64b1dc36263f04`, con corrección de
test HTTP `6d45f065160ff440fc110fac93b23e98f0d70d9b`, incluido en base completa
`5c27e26503c17acec9297c7826bdaaacf96552c5`. No backend ejecutado en RealLocal.
Consulta UA: #176 `9a305b940b24d68c6bb80108060996b6210546a5`.
Estado: implementación local revisable; no aceptación completa A01–A09, cierre,
push, PR, merge, master, deploy ni cambio backend de producción.

## Corte implementado

Tipos cerrados access/return/login/session/cart; mapper de resolución y mapper
de principal; adapter unified; staging ligado a generación; coordinator con
probe me+CSRF autoritativo, selección local y logout frío/coalescido/retry.
`AccessInterlock` usa las colas existentes: CUSTOMER → USER para credenciales
unified, una sola cola para probe/logout de un realm. No nuevo transporte
paralelo. Logout toma CSRF al despachar, luego del write ya enviado. El trabajo
pendiente viejo se cancela; el enviado conserva ownership aunque se destruya
su subscriber. Separar generación pendiente de revisión de actor permite que
ese owner cierre su rotación antes de cambiar identidad. Requests privados
viejos no entregan datos/401 a otro actor. Login legacy/register ahora también
usan las colas de su realm. Probes legacy y registro comprueban generación.

`/login` es la entrada única; redirects legacy traducen sólo ReturnDestination.
UI vive en identity. `/user/home` deriva acciones de UserRole/UserAction y
conserva Offers para ADMIN/OPERATOR. Guards verifican acceso/contexto/roles.
Cart policy impide lecturas/writes CUSTOMER mientras USER está activo o acceso
está pendiente. Cambiar actor limpia cart/address/receipt/profile y caches
privados de consolas/órdenes. Lecturas y callbacks de stores se cancelan por
actor, conservando reconciliación capability y queue ownership existente.

Se preservan catálogo, ofertas, home blocks, favoritos de pestaña, detalles
reactivos/cancelación, estados inventory/commerce cerrados, capability version,
reason/correlation/recovery y todos los contratos CFE existentes. No port CFE.

## Verificación ejecutada

- Typecheck app/spec: PASS (`node node_modules/typescript/bin/tsc --noEmit -p
  tsconfig.app.json`, mismo comando para tsconfig.spec.json).
- Runner RealLocal typecheck standalone: PASS con `--ignoreConfig --target es2022
  --module nodenext --moduleResolution nodenext --skipLibCheck`, sin instalar deps.
- Arquitectura: PASS, 6/6 domain-boundary tests y scan.
- Lint: PASS, `npm run lint` incluye el runner/config UA separados.
- Frontend completo: PASS, 70 archivos / 272 pruebas, `npm run test`.
- Build development: PASS, `npm run build -- --configuration development
  --preserve-symlinks`.
- Build production: PASS sobre HEAD de evidencia `959d16c60c20ef49c6b3fa499a01d2b7b5cb791f`,
  ejecutado por el agente raíz con red autorizada desde `T:\frontend`,
  `npm run build -- --preserve-symlinks`: initial 550.66 kB / estimado transfer
  125.65 kB. No cambio de fuente ni configuración; mapping desmontado.
- Audit runtime: PASS, `npm audit --omit=dev --audit-level=high`, 0 vulnerabilidades,
  misma revisión, ejecutado por el agente raíz con red autorizada. No acredita
  audit de dependencias de desarrollo.
- Playwright MockHttp: PASS, 39/39. Manifest exacto: 24 hojas; redirects se
  excluyen como antes. 24 route smoke+axe, controles de fixtures/readiness/
  contraste/parser, y selector UA con teclado+axe/responsive 1280/375 px.
- Browser: Chromium `153.0.8010.12`; Playwright `1.63.0`; Angular `22.2.1`;
  TypeScript `6.0.3`; Vitest `4.1.11`. Versiones coinciden con package-lock.

Deps locales reutilizadas mediante junction node_modules, sin copiar master ni
modificar dependencias. El sandbox/esbuild rechazó ancestros en ruta larga;
las corridas Angular usaron `subst T:` temporal y desmontaje en `finally`.
Build requiere `--preserve-symlinks` por la junction de dependencias.

Artifacts MockHttp: `frontend/playwright-report/`, `frontend/test-results/`
(ignorados por Git). Servidor SPA local sobre dist development, loopback4300,
fixtures sólo en Playwright. Esto no acredita cookies ni persistencia real.
Revalidación final sobre HEAD `959d16c`, sin cambios de fuente: 39/39 PASS,
21.2 segundos, después de restaurar dist development. Servidor
SPA detenido y `subst` sin mappings al finalizar. Worktree tracked limpio.

## Fallos encontrados y corregidos

Primera suite frontend: 6 fallos de tests de guards antiguos y de expectativas
sobre respuesta privada obsoleta; actualizados al contrato unified.
Luego 5 tests UserStore fallaron por mocks sin actorChanges$; se usa sesión real.
No se borraron suites de integración.

Primera corrida MockHttp: 36/37 PASS; checkout no conservaba las direcciones.
El guard había probado autoridad antes de crear Shell, cuyo OnInit lanzaba un
segundo probe y fence sobre las lecturas del container recién creado. Shell
ahora reutiliza ese estado verificado; nuevo test de regresión y corrida completa
39/39 PASS después de la corrección.

## Gates pendientes, sin sustituirlos por MockHttp

Build production y audit runtime desbloqueados con red autorizada en el agente
raíz (resultados arriba). Los intentos del agente de implementación seguían
rechazados por sandbox: audit devolvió EACCES, log
`work/npm-cache/_logs/2026-10-08T18_50_53_228Z-debug-0.log`.
Audit completo con dependencias de desarrollo sigue sin resultado.

Al compartir dist, el intento final MockHttp vio el build productivo recién
generado y rechazó 26 tests por un request font gstatic Inter v20 fuera del
allowlist exacto del fixture (13 PASS). No fue una falla funcional UA. Se restauró
dist development con el comando ya verificado para repetir el contrato MockHttp
original; no se amplió allowlist ni se cambió fuente. No se reclama prueba browser
del bundle productivo.

A01: PASS parcial Unit/MockHttp (tipos, mapper, rechazo, CSRF ausente, login flow);
happy paths RealLocal NOT_RUN.
A02: PASS parcial Unit/MockHttp de selección tipada y respuesta mismatch;
replay/expiry/binding/Origin/role-loss DB+HTTP RealLocal NOT_RUN.
A03: PASS parcial Unit/MockHttp de probe, hint inválido, 0/1/2 sesiones y selección
local sin POST; reload/cookies reales NOT_RUN.
A04: PASS parcial Unit/MockHttp cold logout/coalesce/retry, stale probe/login,
independencia y queue ordering; carreras Set-Cookie reales NOT_RUN.
A05: PASS parcial Unit/MockHttp A→B/cart/profile/private callbacks y USER cart deny;
readback+DB RealLocal NOT_RUN.
A06: PASS parcial Unit/MockHttp colas/CSRF_INVALID sin replay/destroy/probe-write
y suite capability preservada; browser con CSRF real NOT_RUN.
A07: PASS Unit/MockHttp guards/roles/legacy/return destinations y regresión de
catálogo/ofertas/favoritos/detalles; regresión HTTP real NOT_RUN.
A08: PASS MockHttp 24 hojas exactas, axe, teclado y responsive selector UA.
A09: NOT_RUN. Sin Spring/PostgreSQL HTTPS aislados ni credenciales seed aportadas.

## Runner UA separado

`npm run test:ua-real-local` usa `playwright.ua-real-local.config.ts` y
`ua-real-local/access-smoke.spec.ts`; no carga runner commerce ni intercepta API.
Exige `STORECORE_UA_REAL_ORIGIN` exacto HTTPS127.0.0.1 y confirmación de entorno
isolado `STORECORE_UA_REAL_ISOLATED=true`; creds seed CUSTOMER/USER se aportan
por variables y nunca se adjuntan. Workers1/retries0, una credencial por contexto,
máximo 2 login submissions y 2 selections en el smoke; si la identidad coincide
entre realms son 2 intentos de la misma identidad/origen, no presupuestos nuevos.
Registra los contadores y versión browser, no contraseña/subject/token.
No host alternation, forwarded headers, rate resets ni sleeps para throttling.

El smoke cubre login/cookies/reload-readback/logout, pero DB concordance, negativas
de admisión y carreras completas siguen explícitamente NOT_RUN aun si ese smoke
pasa. El dueño del entorno debe seedear y hacer teardown explícito de DB/proceso
aislados; restaurar DB no limpia budgets del proceso. No hay reset de producción.
Se verificaron typecheck y descubrimiento `--list` (1 test); no se ejecutó el smoke.

No GO de INT-FE-04/05/06, aceptación de INT-FE-02, homologación ni sdd.finish.
