# Progreso — login realm budget

**Estado:** `ready_for_implementation` · **Fecha:** 2026-09-27

El corte está desarrollado en `fix/storecore-login-realm-budget-int`, basado en `integration/storecore-int` (`ab817891`). Pasaron `mvn -q -Dtest=LoginRateLimiterTest test` (7 tests), `mvn -q '-Dtest=LoginRateLimiterTest,IdentityHttpIntegrationTest' test` (19 tests) y `mvn -q test` (29 suites / 126 tests; 0 fallos, errores o skips). `git diff --check` pasó; Git sólo informó conversión de LF a CRLF configurada en Windows. Evidencia detallada: `sdd/reviews/20260927-login-realm-budget-local-verification.md`.

Dos agentes Astra independientes dieron GO al diff de código de esta rama contra `ab81789` para preparar el PR hacia integración. Sus hallazgos P3 y límites constan en `sdd/reviews/20260927-login-realm-budget-astra-code-dual-go.md`. El PR y la revisión de su diff final siguen pendientes. CI remoto no fue ejecutado/verificado.

| Tarea | Estado | Próximo gate |
|---|---|---|
| TASK-LRB-001 | done | GO documental Astra r2 en `sdd/reviews/20260927-login-realm-budget-astra-r2-go.md` |
| TASK-LRB-002 | done | Código y tests locales revisados; preparar PR |
| TASK-LRB-003 | done | Suite completa: 29 suites / 126 tests locales verdes |
| TASK-LRB-004 | pending | Dos GO de agentes registrados; revisar y cerrar el diff final del PR |
| TASK-LRB-005 | pending | Medir barrido O(n) en cada clave nueva, monitor compartido y crecimiento de deque |

CI GitHub no está verificado. Integración, promoción a `master`, release y `/sdd.finish` necesitan sus propios gates; ningún estado de este archivo los presupone.
