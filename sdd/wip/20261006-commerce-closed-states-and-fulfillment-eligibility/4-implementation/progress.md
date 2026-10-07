# Progress

## 2026-10-06 — Plan only

Read canonical SDD, AGENTS, dual-review rule, Falcon lifecycle/evidence/domain
policies, Spring/Angular standards and source/tests listed in technical spec.
Authored functional/technical contracts, migration decision, six gated tasks and
requirement → target → scenario traceability. Static source findings do not
constitute reproduced runtime evidence.

Implementation: NOT_RUN. Integration: NOT_RUN. Review: NOT_RUN.
External homologation/publication: BLOCKED. No production or test code changed;
no DDL, live environment, credentials, git publication or archive performed.

Risk retained until implementation: current source still allows unpaid
fulfillment and implicit restock. This document does not fix running behavior.
Pending first gate: independent Sol review of this plan and explicit GO/NO-GO.

## 2026-10-06 — Implementación local, gates abiertos

GO documental registrado en `sdd/reviews/20261006-commerce-fulfillment-plan-sol.md`.
Baseline `de6a0d7cce780d3db3785468489b237b322b82d9`; rama
`fix/commerce-fulfillment-eligibility`; sin commit ni head nuevo.
Inventario en `consumer-inventory.md`. Revisión identificable del source local:
`43E9F2A6BDAA5C8435EBEAACD60513CDD0978AB8EA2B0288C80C5C1C212F17A7` (SHA-256 del manifiesto de 37 archivos en
`source-manifest.json`; no es SHA Git).

Cambios locales: tipos cerrados Kotlin/TS, traductores únicos y DTOs seguros;
política framework-free de acreditación única, importes/monedas y SALE/reserva
exactos; use case con puertos de carga/guardado y pasos de shipment/recepción.
El adapter transaccional bloquea orders antes de decidir/escribir; worker y
attempt bind/recovery usan el mismo orden y no regresan ACCREDITED. Se eliminó
el restock implícito. RMA sólo recibe todos los ítems tras delivery; cualquier
RMA histórico y comandos INSPECTED/ADJUSTED se rechazan. Frontend necesita
acciones/elegibilidad del backend, oculta controles al cargar y recarga ante
error ambiguo antes de permitir otro intento. CUSTOMER/USER, cookies, ownership,
CSRF y capabilities conservan separación.

### Evidencia ejecutada

- Kotlin CLI 1.9.25/JVM target 17: toda fuente productiva y de test compiló.
  Se usaron jars cacheados del baseline, nunca clases/resultados históricos como
  evidencia. `work/validate-cfe-backend.ps1` compila en work; friend paths para
  tests. Runner JUnit Platform 1.12.2: FulfillmentPolicyTest,
  FulfillmentUseCaseTest, MpCheckoutAttemptPolicyTest y ArchitectureBoundaryTest:
  **20/20 PASS**, cero skipped/aborted/failures. Último test compile/run:
  comando `./work/validate-cfe-backend.ps1 -TestOnly`, sesión 3837, exit 0.
  Es Unit/Static RealLocal, no integración PostgreSQL ni Maven Verify.
- Vitest directo sobre commerce-states, fulfillment-transition, http-mappers,
  checkout-cart use case y fulfillment.store: **5 archivos, 20/20 PASS**.
  `node node_modules/vitest/vitest.mjs run <esos cinco specs> --globals --environment node`.
  Último run 19:16:58 ART, exit 0; sin browser/intercepts como aceptación real.
- `npm.cmd run lint`, `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.spec.json`
  y `node node_modules/@angular/compiler-cli/bundles/src/bin/ngc.js -p tsconfig.app.json --noEmit`:
  PASS sobre fuente final; incluye strict templates, no produce bundle.
- `npm.cmd run check:architecture`: scanner y 6/6 tests PASS. Backend framework
  boundary también está entre los 20 tests de JUnit.
- `git diff --check` con normalización vigente: PASS; avisos LF→CRLF de Git.
  No hay diff en migrations publicadas. Esto no prueba Flyway clean/upgrade.
- `npm.cmd run build` produjo un bundle en un punto intermedio (19:02 ART).
  Builds posteriores sobre el diff final quedaron BLOCKED por ACL; ese bundle
  previo no satisface el gate final ni se entrega como build aprobado.

### Bloqueos de entorno, no tests verdes

`mvn -o -DskipTests compile` no llegó a compilar: “Error computing real path”
y “Acceso denegado” sobre backend; el fallback Kotlin anterior sí compiló.
`ng test --watch=false --include ...` y `ng build` final (también
`--preserve-symlinks`) no resuelven fuentes/styles por “Cannot read directory
../../../../../../..: Acceso denegado”. `docker version` no puede leer config ni
conectar al pipe docker_engine por permission denied. No se alteraron ACLs,
permisos globales, Docker ni configuración de Git; safe.directory sólo por
comando. No solicitar ni inferir credenciales live para resolver esto.

### Pruebas reales authored, no ejecutadas

CommerceHttpIntegrationTest separa promo del checkout negativo y comprueba
rechazo de todos los comandos con shipment/event/return/ledger sin cambios.
MpOrdersCheckoutIntegrationTest añade worker oficial fake→acreditación durable→
SALE real→ship/delivery/readback, recepción sin stock, histórico INSPECTED RESTOCK
bloqueado, re-reserve y reversión incluso RESOLVED, dos sesiones USER para
shipment/RMA, estados comerciales/cantidad corrupta/doble SALE, rollback después
del primer write con CSRF sin rotar, bind/recovery tardíos y carreras con
accredit/reverse/terminateUnpaid. Estas pruebas compilan; PostgreSQL NOT_RUN.
El fixture de rollback declara DDL efímero y elimina sólo su trigger/function
en finally; no se ejecutó aquí y no es migración productiva.

Corrección de descubrimiento autorizada: error HTTP compatible es
`FULFILLMENT_TRANSITION_REJECTED`, no el nombre abreviado inicial del plan.
También se incorporaron bind/recovery al protocolo de writers. No crear alias
ni atribuir estos hallazgos a la review original.

### Residuales y disposición

- CFE-T01–04 siguen in_progress: no se declara rojo inicial reproducido ni gate
  de implementación completo. CFE-T05 blocked por ambiente; CFE-T06 pending.
- E01–E07: evidencia unit/compilación parcial; las variantes PostgreSQL,
  concurrencia/rollback/seguridad y efectos persistidos requieren ejecución.
- E08: protección existente preservada, sin matriz runtime nueva completa.
- E09: wiring HTTPS Angular→Spring→PostgreSQL y Flyway clean/upgrade NOT_RUN;
  la suite browser real de este corte todavía necesita extensión/ejecución.
- CI del head exacto y reviews duales de implementación NOT_RUN. No archive,
  release ni tareas done. No afirmación de homologación del proveedor fake.
- Disposición/restock separado en TODO-045; ningún efecto RESTOCK implementado.
- Sin servidores/contenedores/browser iniciados. Compiladores/runners Node/Java
  terminaron; no recursos persistentes propios a detener. Sin secretos,
  credenciales live, módulos activados, commit/push/PR/merge/tag/deploy.

## 2026-10-06 — Corrección de findings independientes P2

El coordinador entregó findings de review final independiente y review de
seguridad. Se corrigieron cuatro P2 con apply_patch, sin cierre de review ni
afirmación de ambos APPROVED. La metadata completa de reviewers y sus artifacts
pertenece a la coordinación; no se inventa SHA de head ni CI sobre este diff.

- Checkout negativo: el Regex raw nuevo tenía doble escape y podía abortar antes
  de las assertions de fulfillment. Ahora parsea el envelope JSON con ObjectMapper,
  exige orderId positivo y estado tipado. La prueba compila; sus assertions
  PostgreSQL todavía NO_RUN por el bloqueo ya registrado.
- Reload tras mutación ambigua: load elimina los orders previos al iniciar GET.
  Si GET falla, el listado sigue vacío y no reexpone acciones viejas. La regresión
  parte de un snapshot accionable real en la store, falla mutación y GET, verifica
  invalidación durante/después del error y sólo restaura acciones al GET exitoso.
- Carrera pago/fulfillment: la prueba usa una conexión PostgreSQL propia que
  retiene orders FOR UPDATE, encola el primer writer, observa su PID bloqueado,
  encola el segundo y observa ambos mediante pg_stat_activity/pg_blocking_pids
  antes de liberar la barrera. Cubre PAYMENT_FIRST y FULFILLMENT_FIRST para
  accredit/reverse/terminate. Resultados esperados exactos, no 200 OR 400. Si PACKED
  ganó antes de reverse, se intenta SHIPPED, transición que sería válida; exige
  FULFILLMENT_TRANSITION_REJECTED y razón REVERSAL_OR_INCIDENT en readback, sin
  cambiar shipment, eventos, balances o ledger. Es authored/compiled, no runtime
  PostgreSQL ejecutado. Conexión, locks y executor tienen cleanup en finally/use.
- RMA Unknown/ambiguo: use case rechaza ambos comandos antes de persistir;
  OrderView no anuncia ninguna acción, y política frontend bloquea aun con
  ELIGIBLE/PAID/APPROVED. Unidad cubre todas las acciones; integración crea dos
  returns históricos permitidos por schema y comprueba Unknown, acciones null,
  rechazo cerrado y ausencia de efectos. Esa integración compila, no se ejecutó.

Revisión source nueva: `A32AC6027A133696B2A816B168CBC11CFBE83F033A0124F2A87C4802383AB93D`, 37 archivos,
`source-manifest.json`, supersede al fingerprint previo. Sin cambios de DDL,
capabilities, auth, endpoints externos o gates live.

Validaciones posteriores a las cuatro correcciones:

- `./work/validate-cfe-backend.ps1`, sesión 6184, exit 0: full producción/tests
  Kotlin compilados; JUnit **21/21 PASS**, cero skips/abortados/failures.
- Vitest enfocado (los cinco specs anteriores): **20/20 PASS**, 19:28:18 ART.
- tsc de specs, ngc strict templates, lint y arquitectura **PASS**; arquitectura
  6/6, sesión 87144 exit 0. `git diff --check` normal PASS.
- No nueva ejecución PostgreSQL, bundle final, HTTPS, clean/upgrade, E08 completo
  ni CI. Los bloqueos ACL/Docker y gates restantes siguen vigentes. No tests
  blocked convertidos en PASS; no nuevos recursos persistentes iniciados.

CFE-T06 pasa a in_progress por findings/reparaciones, pendiente re-review del
source nuevo y gates. Ninguna tarea done; no publicación, archive o merge.

## 2026-10-06 — Re-review dual del source corregido

Dos revisores independientes GPT-6.1 Sol, esfuerzo medium, releyeron el diff
completo y el fingerprint
`A32AC6027A133696B2A816B168CBC11CFBE83F033A0124F2A87C4802383AB93D`:

- `/root/blackstore_cash_frontend`, revisión Bugbot-style, confirmó las cuatro
  correcciones y devolvió **APPROVED**, sin P0–P3. Reejecutó Vitest 20/20, tsc
  de specs y templates estrictos PASS.
- `/root/storecore_fulfillment_sdd_review`, revisión security/arquitectura,
  confirmó fail-closed de RMA Unknown, auth/ownership/CSRF/capabilities, locks
  order-first, atribución de evidencia y traducción segura; devolvió
  **APPROVED**, sin P0–P3. Verificó hashes del manifest y diff check.

Estas aprobaciones cubren el source manifestado. PostgreSQL/concurrencia, HTTPS
E2E, clean/upgrade, bundle final y CI del head Git siguen pendientes; por eso
CFE-T05 continúa blocked y CFE-T06 in_progress hasta CI exact-head. No se
convirtió ninguna limitación local en PASS ni se autorizó publicación live.

## 2026-10-06 — Primer CI hospedado del PR

El PR `#171` ejecutó Verify `37541585529` sobre
`320277736e8cb9dc6498272c93b86045e8837327`. Frontend y
`unified-access-real-e2e` pasaron. Backend compiló y ejecutó 190 pruebas, pero
falló con dos errores de fixture: dos escenarios nuevos llamaban varias veces
al helper `addAddress`, que intentaba insertar otra dirección default para el
mismo customer y violaba `uq_customer_default_address` antes de probar el
dominio. No fue un fallo de fulfillment productivo.

El helper ahora reutiliza la dirección default durable ya existente y sólo
inserta cuando falta. Este cambio material invalida las aprobaciones exactas del
head anterior: requiere validación focalizada, nuevo fingerprint/review y CI
completo sobre el nuevo head. El run fallido permanece como evidencia histórica.

La recompilación local posterior mediante `work/validate-cfe-backend.ps1`
terminó exit 0: producción y tests Kotlin compilaron y el JUnit focalizado quedó
21/21 PASS. Nuevo fingerprint source:
`2C9F45E0D0151DA6E046511AF080242CA75A8499E7A43F30E34423AEF38A1A55`, calculado
como SHA-256 de líneas UTF-8 `path NUL file-sha256` en el orden del manifest.

El segundo CI exact-head `37542791261` confirmó frontend y E2E real PASS, pero
backend volvió a exponer una segunda precondición del mismo helper: tras el
primer checkout no conservaba el token CSRF rotado por esa mutación. El checkout
siguiente usaba el token consumido y el helper hacía `!!` sobre una respuesta
rechazada sin header. Ahora cada PUT/checkout exige HTTP 200, exige la rotación
CSRF con mensaje diagnóstico y conserva el token nuevo antes de continuar. Se
requiere otro head, reviews y CI; ambos runs fallidos permanecen históricos.

La validación local posterior terminó exit 0: producción/tests Kotlin compilan
y JUnit focalizado 21/21 PASS. Fingerprint actualizado:
`59AB25B767934997B233ECD455A1C261E6B26391C3CE2F24132092C3780C0982`.

El tercer CI exact-head `37543796525` volvió a confirmar frontend y E2E real
PASS. Backend compiló y alcanzó los escenarios nuevos, pero dos checkouts
posteriores dentro del mismo test reutilizaron el `providerOrderId` que el fake
de creación había dejado configurado al hacer `bindRemote`. El segundo intento
violó `mp_checkout_attempts_provider_order_id_key` y abortó la transacción antes
de las assertions de carrera. Los IDs repetidos (`ORD-RERESERVE-*` y
`ORD-WRITER-RACE-*`) y el SQLSTATE 23505 quedan conservados como evidencia; no
se atribuyen al código productivo de idempotencia.

El fixture ahora trata cada `CreationObservation.VerifiedSuccess` configurado
por `bindRemote` como una respuesta de un solo uso y lo limpia en `finally`,
incluso si el bind falla. Así, un checkout posterior vuelve al timeout default
y sólo recibe el provider ID nuevo cuando su propio `bindRemote` lo configura.
No se relajaron asserts, unicidad, carreras ni comportamiento productivo.

`git diff --check` PASS. Maven local no pudo iniciar por el mismo ACL heredado
ya documentado (`Error computing real path` / `Acceso denegado` sobre backend),
por lo que no se declara una validación local nueva. El gate efectivo será el
CI hospedado completo sobre el próximo head. Fingerprint actualizado de 37
archivos: `229A7DBF47089E1B892C8DCC00CE9723E6F1D4992BB226371D33CD2782F9BE70`;
supersede al anterior y requiere reviews duales exact-head más CI verde.
