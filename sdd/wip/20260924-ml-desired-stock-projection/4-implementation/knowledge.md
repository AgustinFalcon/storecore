# Knowledge — proyección de stock deseado ML

Issue canónico = id SDD (`TASK-DSP-*`). No hay issues GitHub para este DAG (a diferencia de login [#49](https://github.com/AgustinFalcon/storecore/issues/49)). Cada corte mergeado a `integration/storecore-int` queda en CHANGELOG y aquí. Hosted CI `steps=[]` no es pass. Sin dispatcher, live ML, grant `INSERT(variant_id)` ni `sdd.finish`.

| Issue SDD | PR | SHA | Dual review | CHANGELOG |
|---|---|---|---|---|
| TASK-DSP-000A | [#52](https://github.com/AgustinFalcon/storecore/pull/52) | `56baa2d` | Astra GO 000A | PIC-009 seal / bridge `NOT_ELIGIBLE` |
| TASK-DSP-R00 | [#51](https://github.com/AgustinFalcon/storecore/pull/51) | `474a007` | `20260927-astra-ml-desired-stock-r00-go.md` | GO documental |
| TASK-DSP-000B | [#84](https://github.com/AgustinFalcon/storecore/pull/84) | `878461f` | prv26 | V15 snapshot; V3 niega ML |
| TASK-DSP-001 | [#85](https://github.com/AgustinFalcon/storecore/pull/85) | `715f37d` | prv27 | V16 purpose |
| TASK-DSP-002 | [#86](https://github.com/AgustinFalcon/storecore/pull/86) | `edf5dcb` | prv28 | V17 proyección |
| TASK-DSP-003 | [#87](https://github.com/AgustinFalcon/storecore/pull/87) | `211e7c6` | prv29 | V18 `STOCK_DESIRED_CHANGED` PENDING |
| TASK-DSP-004 | [#88](https://github.com/AgustinFalcon/storecore/pull/88) | `f82eed1` | prv30 | callers WEB/MP + `acquireScope` |
| TASK-DSP-005 | [#89](https://github.com/AgustinFalcon/storecore/pull/89) | `bdd1c92` | prv31 r2 | lifecycle |
| TASK-DSP-006 | [#90](https://github.com/AgustinFalcon/storecore/pull/90) | `bae7c6e` | prv32 r2 | concurrencia PG16 |
| TASK-DSP-007 | [#91](https://github.com/AgustinFalcon/storecore/pull/91) | `0f8b653` | prv33 | métricas locales |
| TASK-DSP-008 | [#92](https://github.com/AgustinFalcon/storecore/pull/92) | `246662a` | prv34 | coexistencia `LISTING_STOCK` |
| TASK-DSP-R01 / R02 | [#93](https://github.com/AgustinFalcon/storecore/pull/93) | `9ee37d7` | prv35 + prv36 | `ChannelProjectionLockOrder` |
| suite local V3/Tx-C | [#94](https://github.com/AgustinFalcon/storecore/pull/94) | `b735a9a` | prv37 SDD+SCOPE APPROVED | fixtures SQL; V3 ML deny intacto |

Espejo agent: `docs/agent/ml-desired-stock-local-intent.md`.
