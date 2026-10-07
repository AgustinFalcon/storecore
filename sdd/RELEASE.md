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

El corte local CFE de 2026-10-06 tiene GO documental y diff sin commit. No
autoriza release: faltan PostgreSQL/E2E/carreras/rollback/clean/upgrade, bundle
final y review dual/CI del head. Ante un eventual fallo, el rollback no puede
reabrir despacho sin pago: detener escrituras mediante la capability existente,
con autorización operativa separada. Disposición/restock sigue diferido; no hay
migración nueva ni homologación externa en este corte.

## Gate `release/1.0` de integración BlackStore

- [ ] `master` homologado con CI y reviews sobre el SHA final de cada corte core.
- [ ] Facturación/ARCA homologada con contrato oficial, adapter, credenciales por referencia y E2E aprobado.
- [ ] Correo Argentino homologado con contrato oficial, adapter, credenciales por referencia y E2E aprobado.
- [ ] Crear `release/1.0` desde el `master` homologado e integrar allí POSC/DSP/BlackStore por cortes revisables; no promover la rama de integración en bloque.
- [ ] Validar instalación limpia, upgrade Flyway, rollback, kill switch y ausencia de secretos antes de cualquier activación.
