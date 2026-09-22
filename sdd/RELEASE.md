# StoreCore documentation baseline 1.0.0

**Estado:** DRAFT / `ready_for_sol_review`. `sdd-v1.0.0` identifica exclusivamente la baseline documental; `storecore-core-v1.0.0` nombra el contrato de capacidades de producción, no un tag creado.

| Artefacto | Qué es | Estado |
|---|---|---|
| `sdd-v1.0.0` | baseline SDD/documentación | draft, sin tag |
| `storecore-core-v1.0.0` | core merchant-agnostic de producción | ready for Sol review |
| `universal-tools-profile@1.0.0` | perfil importable de config/fixtures compatible con core 1.x | contrato, sin importación productiva |
| `storecore-pos-integration-contract-v1` | OpenAPI companion BlackStore `/blackstore-integration/v1` | **WIP** `ready_for_sol_review`, no approved; D-TTL/D-CURSOR/D-RATE/D-PATH cerrados |

## Gate antes de cualquier Git/release

- [ ] Sol aprueba specs, modelo, ADRs y las 14 tareas core.
- [ ] Evidencia de las 11 tareas L1 y los 3 gates L3.
- [ ] Perfil Universal Tools validado por compatibilidad/previsualización/merge explícito, sin rewrite histórico.
- [ ] Review de fuentes oficiales, secretos por referencia, autorización ML y límites comerciales.
- [ ] Fleet/backup/rollback, redacción y allowlist aprobados.

No se crea tag, release, importación ni publicación hasta completar estos checks y tener aprobación explícita.
