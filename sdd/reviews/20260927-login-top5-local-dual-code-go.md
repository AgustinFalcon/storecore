# Login limiter top 5 — GO local de código Astra A/B

Fecha: 2026-09-27. Alcance: LoginRateLimiter.kt y LoginRateLimiterTest.kt en feat/login-limiter-top5, basados en integration/storecore-int 73367fa. Este expediente documenta el corte local; no sustituye la revisión del PR ni el CI alojado.

## Snapshot revisado

- Producción SHA-256: 1BC884A9A5BC74B51FD494413D3ACA1EBC450DC62E9792FE449EB530F28A0D46.
- Tests SHA-256: AF15BB0E74FA8E7685A279303C93B0320EA1B052F74EB0E31301B59F4027C20C.
- Reportes Surefire locales: 29 suites, 129 pruebas, cero fallos, errores o skips. La prueba enfocada también pasó; git diff --check no registró errores.

## Revisiones independientes

- Astra A: GO final del diff de producción, tests y contrato SDD. El P3 editorial sobre conteos exactos se corrigió antes del veredicto final. Sin P0–P3 abiertos.
- Astra B: GO final del mismo snapshot y resultados. Sin P0–P3 abiertos.

El cambio conserva la semántica observable del limitador con un máximo de cinco timestamps lógicos por bucket, usando reloj efectivo no decreciente. La prueba de referencia cubre 6, 32 y 256 fallos, sufijo acotado, expiración, Retry-After y operaciones intercaladas. TASK-LT5-002/003/004 quedan done local. TASK-LT5-005 permanece pending hasta PR e integración; CI verde, master, release y sdd.finish no están acreditados.
