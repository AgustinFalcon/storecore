# Progreso — cota top 5 del limitador

Estado: in_progress. Fecha: 2026-09-27. TASK-LT5-001–004 done; TASK-LT5-005 pending sólo por los gates de cierre posteriores a la integración.

El GO documental inicial está en sdd/reviews/20260927-login-limiter-top5-astra-documentary-go.md. La implementación se basó en integration/storecore-int 73367fa, posterior a los PR #53–#56. LoginRateLimiter conserva hasta cinco marcas por bucket USER/CUSTOMER y usa un watermark de tiempo efectivo no decreciente bajo el monitor existente. Las pruebas comparan el comportamiento con una referencia independiente de historial completo y cubren secuencias de 6, 32 y 256 fallos, bordes de expiración, Retry-After, capacidad, rewind, clear y llamada directa.

## Evidencia local

- SHA-256 producción: 1BC884A9A5BC74B51FD494413D3ACA1EBC450DC62E9792FE449EB530F28A0D46.
- SHA-256 tests: AF15BB0E74FA8E7685A279303C93B0320EA1B052F74EB0E31301B59F4027C20C.
- Maven/Surefire local: 29 suites, 129 pruebas, cero fallos, cero errores y cero skips; prueba enfocada verde. git diff --check limpio.
- Astra A y B revisaron el mismo snapshot final. Después de corregir la observación P3 de conteos exactos, ambos emitieron GO sin P0–P3 abiertos. Ver sdd/reviews/20260927-login-top5-local-dual-code-go.md.

Esto completa TASK-LT5-002/003/004 a nivel local. El PR #57 se fusionó en integration/storecore-int como b6f37df el 2026-09-27, después de dos GO Astra sobre el HEAD b8d1d4d. La evidencia posterior al merge está en sdd/reviews/20260927-login-top5-pr57-integration.md. La preparación e integración de TASK-LT5-005 están satisfechas; el cierre condicionado sigue pendiente. Verify 36350747675 del PR #57 concluyó failure en backend y frontend con steps=[]. Hosted Verify posterior ya ejecuta steps y puede ser verde: #118 run 36824318135 SUCCESS; #120 run 36824922048 SUCCESS. Sigue sin promoción a master, release o sdd.finish para este WIP.

## Próximo gate

Hosted Verify ahora ejecuta y puede ser verde; no cierra TASK-LT5-005. Acreditar master, release y sdd.finish con sus gates aplicables. Mantener TASK-LT5-005 pending mientras el criterio de cierre siga incluido en esa tarea.
