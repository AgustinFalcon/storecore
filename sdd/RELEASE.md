# StoreCore documentation baseline 1.0.0

**Estado:** baseline core aprobada y archivada; release, tag y deploy no autorizados. `sdd-v1.0.0` identifica exclusivamente la baseline documental y `storecore-core-v1.0.0` nombra el contrato de capacidades core; ninguno representa un tag publicado.

| Artefacto | Qué es | Estado |
|---|---|---|
| `sdd-v1.0.0` | baseline SDD/documentación core | archivada, sin tag ni publicación |
| `storecore-core-v1.0.0` | core merchant-agnostic de producción | aprobado y archivado en baseline por PR #14; sin release |
| `universal-tools-profile@1.0.0` | perfil importable de config/fixtures compatible con core 1.x | contrato, sin importación productiva |
| `storecore-pos-integration-contract-v1` | OpenAPI companion BlackStore `/blackstore-integration/v1` | **WIP** con cortes offline integrados por POSC; módulo DISABLED, companion live/master NO-GO |

## Evidencia cerrada del baseline core

- [x] Sol GO de implementación y fases aprobadas: `sdd/reviews/20260922-sol-go-core.md` y `sdd/features/20260921-single-tenant-installation-baseline/meta.md`.
- [x] Las 14 tareas del baseline están `complete`: 11 tareas L1 y 3 gates L3.

Estos checks cierran la baseline histórica. No cierran los WIP actuales ni autorizan promoción, release o live.

## Gates antes de promoción/release

- [ ] Perfil Universal Tools validado por compatibilidad/previsualización/merge explícito, sin rewrite histórico.
- [ ] Review de fuentes oficiales, secretos por referencia, autorización ML y límites comerciales.
- [ ] Fleet/backup/rollback, redacción y allowlist aprobados.

No se crea tag, release, importación ni publicación hasta completar estos checks y tener aprobación explícita.

Esta reconciliación no aprueba `master`, MP/ML live, fiscal/ARCA, companion live, `sdd.finish`, tag, deploy, secretos, importación productiva ni publicación. Verify debe pasar sobre el HEAD del PR documental y el merge requiere las reviews aplicables.
