# Progreso — login realm budget

**Estado:** `ready_for_implementation` · **Fecha:** 2026-09-27

El corte está desarrollado en `fix/storecore-login-realm-budget-int`, basado en `integration/storecore-int` (`ab817891`). Pasaron `mvn -q -Dtest=LoginRateLimiterTest test` (7 tests), `mvn -q '-Dtest=LoginRateLimiterTest,IdentityHttpIntegrationTest' test` (19 tests) y `mvn -q test` (29 suites / 126 tests; 0 fallos, errores o skips). `git diff --check` pasó; Git sólo informó conversión de LF a CRLF configurada en Windows. Evidencia detallada: `sdd/reviews/20260927-login-realm-budget-local-verification.md`.

Dos agentes Astra independientes dieron GO al diff de código de esta rama contra `ab81789` para preparar el PR hacia integración. Sus hallazgos P3 y límites constan en `sdd/reviews/20260927-login-realm-budget-astra-code-dual-go.md`. El PR #50 hacia `integration/storecore-int` contiene 15 archivos; dos revisiones Astra independientes emitieron `APPROVED` sobre el commit final `da3b3724ed9fba71155f98609decfda7dab79360`. El cierre del gate de revisión consta en `sdd/reviews/20260927-login-realm-budget-pr50-astra-dual-approval.md`. Los jobs alojados de backend y frontend fallaron con `steps=[]`; no hay CI remoto verde verificado.

| Tarea | Estado | Próximo gate |
|---|---|---|
| TASK-LRB-001 | done | GO documental Astra r2 en `sdd/reviews/20260927-login-realm-budget-astra-r2-go.md` |
| TASK-LRB-002 | done | Código y tests locales revisados; preparar PR |
| TASK-LRB-003 | done | Suite completa: 29 suites / 126 tests locales verdes |
| TASK-LRB-004 | done | PR #50: dos Astra independientes `APPROVED` sobre `da3b372`; 126 tests locales; CI remoto no verde (`steps=[]`) |
| TASK-LRB-005 | done | Nueve corridas crudas y JFR; Astra GO de medición/propuesta. Riesgo de contención registrado, sin optimización ni SLO. |

El PR #50 aún no contiene la evidencia nueva de TASK-LRB-005 y no está mergeado. Antes de integrar, publicar el diff final y obtener dos reviews independientes sobre ese HEAD. La optimización sugerida requiere otro SDD/GO. Promoción a `master`, release y `/sdd.finish` necesitan sus propios gates; ningún estado de este archivo los presupone.
