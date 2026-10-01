# Knowledge — proyección de stock deseado ML

Issue canónico = id SDD (`TASK-DSP-*`). GitHub: login [#49](https://github.com/AgustinFalcon/storecore/issues/49), TASK-DSP-009 [#96](https://github.com/AgustinFalcon/storecore/issues/96), SHA stamp [#98](https://github.com/AgustinFalcon/storecore/issues/98), residual release/expiry [#100](https://github.com/AgustinFalcon/storecore/issues/100), SHA stamp [#102](https://github.com/AgustinFalcon/storecore/issues/102) / PR [#103](https://github.com/AgustinFalcon/storecore/pull/103) (`46db87d`). Futuro I/O: [#104](https://github.com/AgustinFalcon/storecore/issues/104) — inyectar `DispatcherProvider` sólo en el primer adapter HTTP de salida autorizado; no es el dispatcher ML. No reabrir issues 1–13 (tenancy SaaS superseded). Cada corte mergeado a `integration/storecore-int` queda en CHANGELOG y aquí. Hosted Verify en `ef2fc5b` sí ejecutó steps y falló de verdad (run `36821352445`): DSP-003 pinneaba techo V18. Issue [#117](https://github.com/AgustinFalcon/storecore/issues/117) merge [#118](https://github.com/AgustinFalcon/storecore/pull/118) (`f8f5eb6`; run `36824318135` SUCCESS) alinea el MAX a V19 y conserva el SHA de V18. Inventario sealed [#120](https://github.com/AgustinFalcon/storecore/pull/120) (`9954f4c`; run `36824922048` SUCCESS). `steps=[]` histórico no es pass; hosted CI de #118/#120 ya no es `steps=[]`. Sin dispatcher ML, live ML, grant `INSERT(variant_id)`, `master` ni `sdd.finish`.

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
| TASK-DSP-009 | [#97](https://github.com/AgustinFalcon/storecore/pull/97) / issue [#96](https://github.com/AgustinFalcon/storecore/issues/96) | `8da8392` | prv39 SDD+SCOPE APPROVED | bridge local en la Tx de saga; V19 source_cause |
| TASK-DSP-009 residual release/expiry | [#101](https://github.com/AgustinFalcon/storecore/pull/101) / issue [#100](https://github.com/AgustinFalcon/storecore/issues/100) | `7d576b3` | prv41 SDD+SCOPE APPROVED | `Dsp009BlackStoreBridgeTest` release/expiry PENDING |

SHA stamp de `#97`: issue [#98](https://github.com/AgustinFalcon/storecore/issues/98) / PR [#99](https://github.com/AgustinFalcon/storecore/pull/99) (`41966d4`). SHA stamp de `#101`: issue [#102](https://github.com/AgustinFalcon/storecore/issues/102) / PR [#103](https://github.com/AgustinFalcon/storecore/pull/103) (`46db87d`).

Futuro (sin código ahora): issue [#104](https://github.com/AgustinFalcon/storecore/issues/104). StoreCore no tiene `HttpClient` de producción; el inbox usa `UnconfiguredOfficialResourceAdapter`. Cuando exista un adapter HTTP oficial autorizado, inyectar `DispatcherProvider` (io only) en ese borde, como BlackStore issue [#12](https://github.com/AgustinFalcon/blackstore/issues/12). No hop en dominio, saga ni `@Scheduled`. No es `STOCK_DESIRED_CHANGED` remoto.

Espejo agent: `docs/agent/ml-desired-stock-local-intent.md`.
