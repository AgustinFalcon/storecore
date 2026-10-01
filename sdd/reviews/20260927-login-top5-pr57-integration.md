# Login limiter top 5 — PR #57 integrado, cierre pendiente

Fecha: 2026-09-27. Evidencia del PR [#57](https://github.com/AgustinFalcon/storecore/pull/57) hacia `integration/storecore-int`.

- HEAD final del PR: `b8d1d4dc682beb3074cb7dd769d560cec6e1816f`.
- Merge: `b6f37df5b9f1ef41e2af194f08a457a25fdcc2c5`, `2026-09-27T21:12:15Z`.
- Dos Astra revisaron y aprobaron independientemente el diff final del PR, sin P0–P3 abiertos.
- Maven local: 29 suites, 129 pruebas, cero fallos, errores y skips; ver `sdd/reviews/20260927-login-top5-local-dual-code-go.md` para el snapshot local.
- Verify alojado [36350747675](https://github.com/AgustinFalcon/storecore/actions/runs/36350747675), HEAD `b8d1d4d`: conclusión `failure`. Jobs `backend` y `frontend` terminaron con `steps=[]`; no ejecutaron pruebas visibles y no cuentan como CI verde.
- Nota 2026-10-01: hosted Verify posterior ya ejecuta steps y puede ser verde. #118 run [36824318135](https://github.com/AgustinFalcon/storecore/actions/runs/36824318135) SUCCESS; #120 run [36824922048](https://github.com/AgustinFalcon/storecore/actions/runs/36824922048) SUCCESS. Eso no es `sdd.finish`, promoción a `master` ni release.

TASK-LT5-001–004 están done. El PR y la integración cubren la primera parte de TASK-LT5-005. La tarea permanece pending porque su aceptación también condiciona el cierre del SDD a los gates aplicables. El WIP queda abierto: sin promoción a `master`, release, activación externa ni `sdd.finish`. No se infiere un SLO de producción de las pruebas locales.
