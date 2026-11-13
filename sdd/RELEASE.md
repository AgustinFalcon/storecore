# StoreCore documentation baseline 1.0.0

## Master vigente — 2026-11-13

`master 33fca34` contiene PR #244–#253. `376790d` es el último snapshot
funcional y PR #253 agrega sólo reconciliación documental. Verify #660
(`43355075159`) y post-merge #661 (`43355855948`) quedaron verdes en backend,
frontend y navegador real. Recovery
delivery permanece integrado con defaults sin credenciales y el hardening de
Origin no altera los contratos publicados. Este estado no crea tag, deploy,
publicación ni homologación; `release/1.0` sigue diferido a los gates externos.

**Estado:** DRAFT / `ready_for_sol_review`. `sdd-v1.0.0` identifica exclusivamente la baseline documental; `storecore-core-v1.0.0` nombra el contrato de capacidades de producción, no un tag creado.

| Artefacto | Qué es | Estado |
|---|---|---|
| `sdd-v1.0.0` | baseline SDD/documentación | draft, sin tag |
| `storecore-core-v1.0.0` | core merchant-agnostic de producción | archivado en `sdd/features/20260921-single-tenant-installation-baseline/`; sin tag ni autorización de deploy |
| `universal-tools-profile@1.0.0` | perfil importable de config/fixtures compatible con core 1.x | contrato, sin importación productiva |
| `storecore-pos-integration-contract-v1` | OpenAPI companion BlackStore `/blackstore-integration/v1` | **WIP** `ready_for_sol_review`, no approved; D-TTL/D-CURSOR/D-RATE/D-PATH cerrados |

## Checklist histórico de baseline y gate de release

El GO core está registrado en `sdd/reviews/20260922-sol-go-core.md` y su feature archivado. Los checks siguientes conservan la checklist original; no invalidan ese cierre ni autorizan release operativo.

- [ ] Sol aprueba specs, modelo, ADRs y las 14 tareas core.
- [ ] Evidencia de las 11 tareas L1 y los 3 gates L3.
- [ ] Perfil Universal Tools validado por compatibilidad/previsualización/merge explícito, sin rewrite histórico.
- [ ] Review de fuentes oficiales, secretos por referencia, autorización ML y límites comerciales.
- [ ] Fleet/backup/rollback, redacción y allowlist aprobados.

No se crea tag, release, importación ni publicación hasta completar estos checks y tener aprobación explícita.

El corte CFE integrado por PR #171 fue revalidado sobre PR #231 head
`9108798818b0217dcf5bb4685f59a195d63637ae`, merge
`eca9db9f0ba51023c8b785831003cb04d8ba0660`. Verify exact-head #594
(`42538029894`) confirmó frontend, backend y browser: 4 journeys CFE reales,
1 Unknown MockHttp, acceso 12/12, PostgreSQL 16 y clean/upgrade de migraciones.
El candidato documental `4debf9b` pasó Verify `42653866473` y doble review
GPT-6.1 Sol; el SDD queda archivado. No se afirma CI push de master ni se autoriza release,
homologación, credenciales live o activación. Ante un eventual fallo, el rollback no puede
reabrir despacho sin pago: detener escrituras mediante la capability existente,
con autorización operativa separada. El corte posterior #233 cerró disposición
por ítem y reposición RESTOCK-only en
`sdd/features/20261109-commerce-rma-item-disposition-and-restock/`
(candidato `fc80316`, Verify `42666041072`, doble review Sol). Siguen excluidos
RMA parcial/múltiple, compensación posterior, reembolso, nota fiscal y carrier.
No se infiere homologación externa de ninguno de estos cortes.

## Gate `release/1.0` de integración BlackStore

- [ ] `master` homologado con CI y reviews sobre el SHA final de cada corte core.
- [ ] Facturación/ARCA homologada con contrato oficial, adapter, credenciales
  por referencia y E2E aprobado. La biblioteca candidata RC.4 ya pasó sus gates
  locales y CI remoto (`8efeace`), pero no tiene tag/paquete remoto acreditado y
  no sustituye matriz fiscal, adapter StoreCore ni homologación.
- [ ] Correo Argentino homologado con contrato oficial seleccionado, adapter,
  credenciales por referencia y E2E aprobado. Discovery actual:
  `sdd/wip/20261111-correo-argentino-carrier-discovery/` (NO-GO para código).
- [ ] Crear `release/1.0` desde el `master` homologado e integrar allí POSC/DSP/BlackStore por cortes revisables; no promover la rama de integración en bloque.
- [ ] Validar instalación limpia, upgrade Flyway, rollback, kill switch y ausencia de secretos antes de cualquier activación.
