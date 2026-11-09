# CFE — aceptación local acumulativa 2026-11-05

Base: `master` `8b8ff478cb0ea596941f9db203bcfbb7357accf0`.
Rama de cierre: `codex/storecore-cfe-acceptance`.
Alcance: evidencia local de CFE-T05; no acredita proveedor live, homologación,
publicación ni activación.

## Browser real

Entorno descartable: PostgreSQL `16-alpine`, base `storecore_ua_e2e`, Spring Boot
empaquetado, Angular HTTPS y proveedor loopback HTTP con firma HMAC. El runner
eliminó sus servidores hijos y certificados temporales al finalizar.

Comandos y resultado:

- `npm run check:ua-real` — PASS; 17 casos descubiertos.
- `npm run test:ua-real` — PASS; 17/17 en 2.6 minutos.
- CFE real: 4/4 journeys PASS.
- CFE representación Unknown: 1/1 MockHttp PASS, contabilizado por separado.
- Acceso unificado: 12/12 PASS, incluida expiración real de 120 segundos.

Manifest del output Playwright:

- CFE E01 pending checkout / CUSTOMER denial — PASS.
- CFE E03/E09 signed provider / worker / ordered reload — PASS.
- CFE E07 durable once-only reception / no stock mutation — PASS.
- CFE E06/E08 committed response loss / GET recovery / session isolation — PASS.
- CFE E02/E07 malformed future states — PASS, MockHttp only.
- Unified access tests 1–12 — PASS; incluye CUSTOMER, ADMIN, OPERATOR, dual
  challenge, rehidratación, replay consumido, expiry 120 s, ambos logout y dos
  variantes de pérdida de rol.

El reporter HTML local quedó en `frontend/ua-real-results/report/` y los logs
de backend/provision/Angular en `frontend/ua-real-results/`. Son artifacts
ignorados y no se versionan porque pueden contener credenciales fixture,
cookies, CSRF o challenges; la evidencia versionada conserva únicamente el
resumen redactado.

La suite ejercitó checkout pendiente bloqueado, observación firmada del proveedor,
worker e inventario/SALE durables, despacho secuencial con reload, recepción RMA
única sin restock, pérdida de respuesta después del commit, GET autoritativo,
rechazo de replay y aislamiento CUSTOMER/USER.

## Backend y migraciones

Comando:

`mvn -B -Dtest=CommerceHttpIntegrationTest,MpOrdersCheckoutIntegrationTest,JdbcFulfillmentEvidenceBoundaryTest,CoreSchemaMigrationTest,CapabilityDefinerMigrationTest test`

`mvn -B -Dtest=CfeBaselineUpgradeMigrationTest test`

Resultado: PASS, 37/37, 0 failures, 0 errors. Testcontainers usó PostgreSQL
16.14. `CoreSchemaMigrationTest` acreditó instalación limpia V1–V11;
`CapabilityDefinerMigrationTest` acreditó upgrade publicado V8→V9 sin editar
checksums. `CfeBaselineUpgradeMigrationTest` valida nuevamente las 11
migraciones publicadas, ejecuta un segundo migrate no-op, compara todo
`flyway_schema_history` y conserva una fila histórica. Además,
`git diff --exit-code de6a0d7cce780d3db3785468489b237b322b82d9..HEAD -- backend/src/main/resources/db/migration`
terminó sin diferencias. Los casos de comercio acreditaron estados históricos fail-closed,
ownership, stock, evidencia y transiciones.

Procedencia exacta de `backend/target/surefire-reports/*.txt`:

- `CommerceHttpIntegrationTest`: 7 PASS.
- `JdbcFulfillmentEvidenceBoundaryTest`: 2 PASS.
- `MpOrdersCheckoutIntegrationTest`: 17 PASS.
- `CapabilityDefinerMigrationTest`: 1 PASS.
- `CoreSchemaMigrationTest`: 9 PASS.
- `CfeBaselineUpgradeMigrationTest`: 1 PASS.

Total: 37 PASS, 0 failures, 0 errors, 0 skipped. Los reportes XML/TXT son
outputs de build ignorados; no contienen autoridad adicional y se regeneran
con el comando documentado.

## Matriz E01–E09

- E01 — PASS: browser CFE E01 + `CommerceHttpIntegrationTest`.
- E02 — PASS: `JdbcFulfillmentEvidenceBoundaryTest` y caso browser MockHttp
  separado para valores imposibles; este último no acredita wiring.
- E03 — PASS: browser CFE E03/E09 + `MpOrdersCheckoutIntegrationTest`.
- E04 — PASS: integración backend de re-reserva, variante/cantidad y rechazo.
- E05 — PASS: integración backend de concurrencia, orden y efecto único.
- E06 — PASS: browser response-loss/GET + backend rollback/retry.
- E07 — PASS: browser recepción única/no-restock + históricos fail-closed.
- E08 — PASS: browser aislamiento + matrices HTTP de sesión, rol, CSRF,
  Origin, capability y ownership.
- E09 — PASS local: Angular HTTPS→Spring→PostgreSQL, reload, clean V1–V11,
  upgrade V8→V9 y baseline V11→actual no-op con checksums e histórico
  preservados. La homologación de proveedor permanece fuera de alcance.

## Recursos

El contenedor nombrado `storecore-ua-e2e` fue creado únicamente para esta
aceptación. Debe eliminarse al concluir la coordinación. Los contenedores de
Testcontainers quedaron bajo Ryuk y terminaron con la JVM. No se usaron datos,
tokens ni cuentas productivas.

## Gate restante

CFE-T06 permanece abierto hasta que el commit documental exacto tenga CI verde y
dos revisiones independientes sin P0–P3. Esta evidencia no modifica código
productivo y no cambia el NO-GO de MP live, ARCA, Correo Argentino ni companion.
