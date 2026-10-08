# INT-FE-01 — capability sobre integración, 2026-10-08

Base exacta: 06f9fc183b5c5f9b4ab0c0ce49810eb3c58acfe8. Rama local: integration/storecore-frontend-capability, worktree storecore-int-fe01-capability. Fuentes revisadas: 40ffb6e3aaba9181791c0a6097608c2fd3de3b34 (readmodel) y 79336785af51aaaa31765defd2c83b3a383c1817 (command), obtenidas por fetch de repos locales. No cherry-pick global ni stamps/reviews históricos.

Allowlist: backend configuration domain/application/JDBC/controller y mapping test; frontend capability domain/repository/mappers/usecase/store/view/container y tests. El baseline difiere de los padres fuente en UserRole, MercadoLibreAccountStatus y dominio sin Angular; esos cambios se preservaron manualmente. La única adaptación fuera de capability añade changingCapability=false al fixture InstallationState del test ML existente. Sin migraciones ni cambios de checksums V1..V20. Ofertas, favoritos, UA/CFE y runtime route manifest no se reemplazan.

Readmodel module/state cerrados con Unknown fijo; companion y module Unknown ocultos. DB/HTTP usan el traductor de borde. Unknown no se convierte a Disabled ni autoriza comandos. Backend ChangeState rechaza Unknown; HTTP requiere versión positiva y motivo no vacío antes de admisión.

FE conserva el snapshot/version recibido y genera un UUID por intento. Envía estado tipado, correlationId, expectedConfigVersion y motivo explícito. UI consulta roles tipados de readMe: sólo ADMIN muestra comandos; OPERATOR consulta. Backend mantiene auth.admin, SameOrigin, verificación/rotación CSRF y ownership de correlación existentes. Interceptor de sesión mantiene su cola y recuperación sin replay.

Comandos superpuestos se ignoran con exhaustMap, controles deshabilitados durante el intento. Error/conflicto o timeout (15s) consulta GET commands/{correlationId}, luego GET capabilities; muestra resultado cerrado y snapshot autoritativo sin reenviar el POST. Resultado no confirmado permanece Unknown y no se presenta como éxito. Si el GET autoritativo falla, muestra error y conserva snapshot previo: requiere recarga, sin PASS de persistencia.

## Evidencia y límites

- Backend: mvn -o -Dmaven.repo.local=C:/Users/agustin/.m2/repository test -Dtest=CapabilityModuleViewMappingTest,InstallationCapabilityModuleTest,InternalRoleCapabilityTest,Posc002bCapabilityAdminOperationTest: PASS, 4 suites/8 tests, 0 failures/errors/skips, compilación completa de main y tests.
- Backend DB: intento de surefire:test para CapabilityTask003Test y Posc002bCapabilityTxsTest: ERROR/BLOCKED, Docker pipe AccessDenied y entorno Docker no disponible. No se cuentan como PASS. Los otros 2 unit en ese intento pasaron.
- Frontend primer intento por ruta larga: ERROR de esbuild al recorrer ancestros Windows. Subst S: temporal resolvió unit focales: 7 suites/21 tests PASS antes de las ampliaciones finales.
- npm ci offline falló ENOTCACHED (yocto-queue y zod según cache); intento prefer-offline con red falló EACCES. Se copiaron únicamente dependencias locales existentes a node_modules propio (ignorado) y se ejecutó por drive corto; no cambios de config productiva, package ni lock.
- Backend usa drive T: temporal y cache Maven existente. Drives se desmontan en finally en todos los comandos.
- RealLocal Angular → Spring → PostgreSQL, reload/browser cookies, hosted CI, reviews exact-head y homologación: NOT_RUN/pendientes. Este corte no declara INT-FE-01 cerrado.

Frontend final: npm run verify por S: ejecutó architecture (6 tests + scan PASS), lint PASS y todas las 59 suites/220 tests PASS. Build production ERROR/BLOCKED al descargar Inter desde fonts.googleapis.com (red restringida); npm run build -- --configuration development PASS, bundle de 2.21 MB. No se equipara el build development a production. Ningún descubrimiento o prueba MockHttp equivale a RealLocal.

MockHttp browser: npm run test:a11y por S: imprimió 37 tests OK, incluyendo las 24 rutas, manifest exacto, fixtures/contraste/readiness. El proceso quedó sin completar durante teardown/reporter y se interrumpió con Ctrl-C tras varios minutos; exit 1, no se registra PASS global. No se cuenta como evidencia de comandos Spring/DB ni cookies reales. HTML/.last-run no fue publicado. No se modificó playwright.config.ts para esconder el bloqueo.

SDD JSON parse PASS; diff de commit contra baseline: git diff HEAD^ HEAD --check PASS. Worktree limpio tras commit; no push/PR ni cambios a migraciones.
