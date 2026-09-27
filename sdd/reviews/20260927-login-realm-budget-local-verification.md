# Login realm budget — verificación local en branch de integración

**Fecha:** 2026-09-27 · **Branch:** `fix/storecore-login-realm-budget-int` · **Base:** `integration/storecore-int` / `ab817891abb6c7b710bca809804d924401ed74f0`.

## Comandos y resultados

- `mvn -q -Dtest=LoginRateLimiterTest test` — 7 tests, 0 failures/errors/skips.
- `mvn -q '-Dtest=LoginRateLimiterTest,IdentityHttpIntegrationTest' test` — 19 tests, 0 failures/errors/skips.
- `mvn -q test` — 29 suites, 126 tests, 0 failures/errors/skips.
- `git diff --check` — exit 0. Git informó sólo que LF se convertirá a CRLF según la configuración Windows del repositorio.

Las pruebas de identidad y contexto corrieron contra PostgreSQL 16 efímero con Testcontainers. El test HTTP de saturación llenó las 10 000 claves CUSTOMER usando el bean real y comprobó que un login con credenciales correctas recibió `429 AUTH_RATE_LIMITED` y no emitió cookie. El test de sexto login usó JDK `HttpClient` con timeouts de conexión/solicitud y observó el primer 429 sin reintento automático.

Las pruebas unitarias usan reloj mutable para seis fallos intercalados, el índice `n - 5`, la expiración del primer fallo sin desbloqueo anticipado, dos buckets con fallos escalonados y vencimiento por último fallo, redondeo hacia arriba y límite temporal exacto. `clear` y el presupuesto USER/CUSTOMER quedan aislados.

## Alcance de la evidencia

Esta evidencia cubre ejecución local en el branch señalado. No representa CI remoto, aprobación de revisores, merge a integración, promoción a master, release ni cierre `/sdd.finish`.
