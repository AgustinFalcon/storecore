# INT-FE-03 — Unified Access frontend: contrato previo al port

Estado: `documented_for_review`. No código de producto, GO, PASS de frontend,
browser, DB o cierre implícito. Base exacta del corte documental:
`b8bd49018413a503f5af8d04aa64b1dc36263f04` (INT-FE-02 backend).
Rama: `integration/storecore-unified-access-frontend-sdd`.
Fuente de consulta: #176 `9a305b940b24d68c6bb80108060996b6210546a5`,
contrato archivado `sdd/features/20261003-unified-access-entry/` en esa fuente.
El port posterior requiere revisar cada hunk contra este destino; no copiar master.

## Allowlist y límites

Se permiten únicamente hunks UA en `frontend/src/app/domain/` (tipos, ports y
use cases de acceso/sesión/carrito), `core/auth/` (sesiones, guards, coordinator,
interlock y CSRF), adapters/mappers de identidad en `data/`, login y selección en
`features/identity/`, entrada/home USER y sus permisos en `features/admin/`,
shell, wiring `app.config.ts` y `app.routes.ts`, y limpieza de datos privados en
stores/containers CUSTOMER/carrito. Tests focales acompañan esos hunks. Manifest,
fixtures y axe se amplían sólo para rutas UA; runner RealLocal UA separado y su
script/configuración mínimos se revisan individualmente. La lista es permiso de
hunks por responsabilidad, nunca permiso de reemplazar esos directorios.

**NEVER COPY FROM MASTER:** no reemplazar app.routes, app.config, mappers,
repositories, interceptors, stores ni shell completos. Preservar SessionMutationQueue,
rotación CSRF, capability correlation/versión/motivo/recovery de INT-FE-01, home
blocks/ofertas, favoritos de pestaña, inventory sealed, cancelación e identidad
reactiva de detalle, Unknown fail-closed y reconciliation de escrituras ya enviadas.
No backend/SQL/Flyway nuevo, no contratos CFE, payments/fulfillment/ship/RMA ni
runner commerce mezclado. INT-FE-04 conserva su propio gate E01-E09.

## API y cookies verificadas en la base

POST `/api/v1/auth/login`: `{email,password,returnPath?}`; email máximo 320,
password 12..128 code points, returnPath transporte máximo 4096 (política 2048).
POST `/api/v1/auth/context-selection`: `{challenge,context}`; challenge 32..256,
context máximo 16, sólo CUSTOMER/USER conocidos. El envelope existente se decodifica
en el borde. `AUTHENTICATED` contiene context, home y destination.kind;
`CONTEXT_SELECTION_REQUIRED` contiene challenge, contexts, expiresAt y
destination.kind. Nunca subject IDs, contraseña o token de sesión en JSON público.
Contextos del selector proceden sólo de candidatos verificados por el servidor.

Ambos POST exigen Origin aceptado y responden no-store. Autenticación emite
`X-CSRF-Token`, una cookie de realm y expiración de challenge. Selección pendiente
emite `__Host-storecore_access_challenge`, máximo 120 segundos, HttpOnly, Secure,
SameSite=Lax, Path=/ y sin Domain. Sesiones independientes:
`__Host-storecore-customer` y `__Host-storecore-internal`, mismos atributos y
máximo 12 horas. El browser administra cookies; no Bearer/JWT/localStorage.
CSRF queda en memoria por realm, nunca se adopta si respuesta/actor/generación no
coinciden. AUTHENTICATED incompleto o sin CSRF no concede autoridad cliente;
reconciliar mediante probe/CSRF autoritativo antes de habilitar writes.

Legacy permanece en backend: CUSTOMER `/api/v1/customer/auth/{login,csrf,logout}`
y `/api/v1/customer/me`; USER `/api/v1/internal/auth/{login,csrf,logout}` y
`/api/v1/internal/me`. No inferir endpoints USER de `/user/`.
ReturnDestination admite HOME, CATALOG, CUSTOMER_PROFILE, CUSTOMER_ORDERS,
USER_ORDERS; AccessHome STOREFRONT/OPERATIONS. Sólo rutas exactas del traductor
backend; URL externa, query, fragmento, encoding o realm incompatible cae a home
seguro. El frontend no navega el texto returnTo/returnPath recibido directamente.

## Tipos cerrados y responsabilidades

AccessContext, AccessHome, ReturnDestination, resultado de login, estado del
coordinator, selección/revocación y CustomerCartAccess son tipos cerrados TS:
constructor privado, casos estáticos, único fromWire, Unknown fail-closed; roles
reutilizan UserRole. Regla, etiqueta y permisos viven en tipos, no switches de
strings en vista/store/test. Cada paso (credenciales, selección, reconciliación,
navegación) es objeto de una responsabilidad; recorrido los ordena. Dominio sin
Angular, HTTP o UI. Adaptador valida estructura completa y no imprime wire Unknown.

## Interlock coordinator / queue / CSRF

El coordinator no es un segundo transporte paralelo a UserMutationQueue y
CustomerMutationQueue. Cada transición login/selection/probe/logout se coordina
con la cola del realm afectado antes de adoptar identidad o CSRF. Trabajo todavía
no enviado de una generación anterior se cancela. Request ya enviado conserva
ownership hasta respuesta/reconciliación aunque el componente se destruya; sólo
entonces continúa el siguiente write con CSRF actual. No reset ni token stale.

Revoke/login/probe usan fences de generación por realm: una respuesta vieja no
resucita autoridad, borra actor nuevo ni pisa CSRF. Cambiar A→B borra cart/profile
y todo cache privado; GET/401 tardíos no contaminan B. USER no escribe carrito
CUSTOMER. Logout frío es cold y coalescido; error permite retry explícito sin
doble envío. Revocar un realm deja el otro independiente. CSRF_INVALID no reenvía
mutación automáticamente; reconciliar estado y dejar decisión explícita al usuario.
Cambiar contexto entre sesiones existentes verifica disponibilidad y selecciona
localmente, sin POST de credenciales/selection ni autoridad desde hints guardados.
Cookie Set-Cookie tardía requiere prueba real de browser: ignorar callbacks en JS
no evita por sí mismo que el navegador aplique el header.

## Matriz de aceptación A01–A09 (todo NOT_RUN)

- A01: /login único; CUSTOMER-only, USER ADMIN-only/OPERATOR-only y candidato
  doble. Rechazo genérico, Unknown, payload inválido, CSRF ausente y error de red
  no conceden autoridad. Unit/MockHttp más happy paths RealLocal.
- A02: selección válida; replay, expiración, binding/Origin inválidos y pérdida
  de rol rechazan sin sesión nueva. DB/HTTP RealLocal y negativos MockHttp tipados.
- A03: reload con cero/una/dos sesiones; hints inválidos no autorizan; selección
  local sin POST; realm no disponible/Unknown falla cerrado. Browser RealLocal.
- A04: logout por contexto, cold coalescido/retry, login/probe/revoke tardíos y
  realms independientes. Unit de orden y carreras de cookies RealLocal.
- A05: A→B limpia carrito/perfil/privados; lecturas, 401 y CSRF tardíos no
  contaminan; USER no ejecuta cart writes. Unit/MockHttp y readback RealLocal.
- A06: dos writes por realm serializados; destroy, CSRF_INVALID sin replay,
  probe/write concurrente y capability correlation conservados. Unit y browser
  con CSRF real; sin activar companion como fixture.
- A07: redirects legacy, returnTo malicioso, homes y roles, ofertas ADMIN/OPERATOR;
  catálogo/ofertas/favoritos de pestaña/detalles preservados. No nueva persistencia
  de favoritos ni nuevas reglas CFE. Router/unit y regresión HTTP relevante.
- A08: axe, teclado, responsive y igualdad exacta manifest/rutas runtime luego
  del port; contar redirects aparte de hojas. MockHttp no acredita persistencia.
- A09: Chromium HTTPS → Angular → Spring → PostgreSQL aislado, cookies reales,
  writes con CSRF real, respuesta+GET tras reload+DB concordantes y carreras de
  login/logout/actor. Sin interceptar API de aceptación. NOT_RUN si falta entorno.

## Runner UA-only y presupuesto

Diseñar runner/config separado de CFE: sin checkout de pago, shipping/RMA,
proveedores reales, fiscal, ML o companion. No importar runner master completo.
Fijar origen HTTPS, host loopback y destinos permitidos; no alternar localhost,
127.0.0.1 y ::1 para obtener presupuestos diferentes. Origin/cookies deben coincidir
con contrato. No headers forwarded falsos, resets de producción ni sleeps para
ocultar throttling. Fixtures/DB y backend son exclusivos del run; limpiar con
teardown explícito y reiniciar proceso aislado entre escenarios si es necesario,
porque restaurar DB no limpia presupuestos en memoria.

Credenciales unified+legacy comparten cinco intentos por identidad canónica/origen
lógico; sexto limitado. Éxito no reinicia evidencia. Selección tiene diez submissions
por IP confiable en quince minutos (éxito consume), aparte del rechazo por IP+hash;
no gastar ese presupuesto con setup reutilizado inadvertidamente. Planificar y
registrar intentos por escenario, cero retry ciego; 429 se verifica explícitamente.
Nunca relajar LoginAttemptBudget, ClientAddressResolver o SelectionAdmission.

## Gates y evidencia

Subpasos y dependencias en [plan](../3-tasks/plan.md). Antes de código revisar
allowlist/interlock, luego tipos/adaptador, coordinator, UI y tests. Antes de
aceptación: arquitectura, lint, unit, build; manifest/axe; A09 real y regresiones
INT-FE-01. Registrar SHA FE/BE, versión navegador, DB, comando, conteos, artifacts,
modo RealLocal/MockHttp/FixtureOnly y resultado por Axx. INT-FE-02 DB/reviews/CI
pendientes no se transforman en PASS por este documento. Ningún merge/push/PR,
homologación, master, release, deploy o sdd.finish autorizado por este corte.

## Validación documental 2026-10-08

PASS: parse de los tres JSON del WIP; 24 rutas runtime igual a route_count;
DAG sin ciclos ni dependencias ausentes; A01–A09 en task; 23 links Markdown
locales del WIP resuelven; `git diff --check`. Únicamente archivos de este WIP
cambian respecto de la base exacta. No suite de producto aprobada en este corte.

Se intentaron `node --test frontend/scripts/domain-boundary.test.mjs` y
`node frontend/scripts/check-architecture.mjs`: ambos exit 1 antes de validar,
`ERR_MODULE_NOT_FOUND: typescript` en el worktree nuevo sin node_modules.
Resultado arquitectura: NOT_RUN por dependencia ausente, no PASS ni defecto nuevo
del producto. No se instalaron dependencias; lint/unit/build/axe/A09 no ejecutados.
