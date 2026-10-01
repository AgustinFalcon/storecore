# Knowledge — convergencia POS

Issue canónico = id SDD (`TASK-POSC-*` / PIC). Merge sólo a `integration/storecore-int`. `INSERT(variant_id)` runtime sigue false. Live BlackStore, fiscal y `sdd.finish` NO-GO.

| Issue SDD | PR | SHA | Dual review |
|---|---|---|---|
| TASK-POSC-000 | [#59](https://github.com/AgustinFalcon/storecore/pull/59) | `6ebab95` | ADR YAML |
| TASK-POSC-000A | [#61](https://github.com/AgustinFalcon/storecore/pull/61) | `3df741c` | harness OpenAPI 64/65 |
| TASK-POSC-001 | [#63](https://github.com/AgustinFalcon/storecore/pull/63) | `9ce355b` | harness PG16 |
| TASK-POSC-002B | [#66](https://github.com/AgustinFalcon/storecore/pull/66) / [#72](https://github.com/AgustinFalcon/storecore/pull/72) | `20152b9` / `8bc95cf` | prv14 |
| TASK-POSC-002C | [#67](https://github.com/AgustinFalcon/storecore/pull/67) / [#73](https://github.com/AgustinFalcon/storecore/pull/73) | `37b1621` / `8e2a47f` | prv15 |
| TASK-POSC-002D | [#68](https://github.com/AgustinFalcon/storecore/pull/68) | `d4a3a36` | prv10 |
| TASK-POSC-002E | [#69](https://github.com/AgustinFalcon/storecore/pull/69) | `7579d1d` | prv11 |
| TASK-POSC-002F | [#70](https://github.com/AgustinFalcon/storecore/pull/70) | `bfdfb88` | prv12 |
| TASK-POSC-002G | [#71](https://github.com/AgustinFalcon/storecore/pull/71) | `a6f520b` | runbook |
| TASK-POSC-003A | [#75](https://github.com/AgustinFalcon/storecore/pull/75) | `6cc7ffa` | prv17 |
| TASK-POSC-003B | [#76](https://github.com/AgustinFalcon/storecore/pull/76) | `06a85e2` | prv18 |
| TASK-POSC-003C | [#77](https://github.com/AgustinFalcon/storecore/pull/77) | `21780e4` | prv19 |
| TASK-POSC-003D | [#78](https://github.com/AgustinFalcon/storecore/pull/78) | `eb59fb7` | prv20 |
| TASK-POSC-003E | [#79](https://github.com/AgustinFalcon/storecore/pull/79) | `1f81f1f` | prv21 r2 |
| TASK-POSC-004 | [#80](https://github.com/AgustinFalcon/storecore/pull/80) | `9ff1392` | prv22 |
| TASK-POSC-004A | [#81](https://github.com/AgustinFalcon/storecore/pull/81) | `1dbad5d` | prv23 |
| TASK-POSC-006 | [#82](https://github.com/AgustinFalcon/storecore/pull/82) | `dc23b45` | prv24 |
| TASK-POSC-005 | [#83](https://github.com/AgustinFalcon/storecore/pull/83) | `d4137fb` | prv25 |

CHANGELOG unreleased lista los mismos PRs. Fixture SQL de `BLACKSTORE_INTEGRATION` en 002E/002F merge [#94](https://github.com/AgustinFalcon/storecore/pull/94) (`b735a9a`, dual prv37 APPROVED) no acredita companion live ni reabre Tx-C. TASK-DSP-009 merge [#97](https://github.com/AgustinFalcon/storecore/pull/97) (`8da8392`, issue [#96](https://github.com/AgustinFalcon/storecore/issues/96), dual prv39 APPROVED) delega el bridge local en la Tx de saga; no es companion live. Residual release/expiry merge [#101](https://github.com/AgustinFalcon/storecore/pull/101) (`7d576b3`, issue [#100](https://github.com/AgustinFalcon/storecore/issues/100), dual prv41 APPROVED). SHA stamp [#103](https://github.com/AgustinFalcon/storecore/pull/103) (`46db87d`). Futuro I/O [#104](https://github.com/AgustinFalcon/storecore/issues/104): `DispatcherProvider` sólo si aparece HTTP de salida; no aplica hoy a workers JDBC/`@Scheduled` ni a la saga POS.
