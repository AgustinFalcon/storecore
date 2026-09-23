VERDICT: CONDITIONAL_GO

# Sol gate — next work after PR #16

**Fecha:** 2026-09-23  
**Baseline revisado:** `master` @ `3eb8183` (PR #16 merged)

## Decisión

No hay ningún GO de implementación para Luna. MP-LIVE-01–04 están cerrados; MP-LIVE-05, POS, fiscal y toda capacidad nueva continúan bloqueados. El único carril abierto es estrictamente documental: incorporar propuestas no ejecutables y someter el contrato POS a un veredicto documental de Sol. Ningún documento propuesto cambia `ready_for_sol_review`, `documented_deferred` o `blocked_by_sol_gate` por sí solo.

| Ítem restante | Allowed | Forbidden | Blocked |
|---|---|---|---|
| Implementación nueva | Ninguna. | Código, DDL, migrations, endpoints, adapters, workers, activación o side effects inferidos de documentos, backlog o archivos locales. | Requiere WIP implementable, trazabilidad, plan y GO Sol explícito para tareas concretas. |
| POS ADR-007 | Commit documental como `proposed for Sol`, conservando tombstone anti-resurrection y sin marcar tareas done/approved. | Implementar locks, tombstones, purge, endpoints, tablas o comportamiento BlackStore. | Toda ejecución de `TASK-PIC-*`/`TASK-L3-*` y cambios de estado del WIP hasta veredicto posterior. |
| POS ADR-008 | Commit documental como `proposed for Sol`, dejando V4/V5/V6 como diseño futuro no autorizado. | Crear migrations V4/V5/V6, capability `BLACKSTORE_INTEGRATION`, promoción, config, credentials o bypass de triggers. | Validación del contrato y GO de implementación separado; el ADR no aprueba el feature. |
| Addendum fiscal 20260922 | Commit documental bajo `documented_deferred`, con todos los gates Open. | Código o DDL fiscal, capability, inbox/outbox fiscal, worker, adapter, homologación, emisión, certificados, secretos o activar propuestas D-01/D-07/SC-02/SC-03/SC-07. | D-01..D-07, SC-01..SC-07, matriz titular/contador, fuentes oficiales fechadas, biblioteca publicada, WIP implementable y GO Sol específico. |
| `EffectivePrice*.kt` untracked | Dejarlos fuera de todo commit y sin uso. Luna puede eliminarlos sólo con confirmación del dueño de esos cambios locales. | Tratarlos como GO, integrarlos, probarlos como feature autorizada o incluirlos en un PR/commit documental. | No existe feature/WIP/plan/GO; la regla de preservar cambios locales impide borrarlos por inferencia. |
| Review del contrato POS v1 | Sol puede emitir ahora un veredicto documental sobre el corpus `ready_for_sol_review`; Luna puede preparar/commitir únicamente correcciones documentales que el veredicto solicite. | Interpretar la revisión, un ADR aceptado o decisiones D-TTL/D-CURSOR/D-RATE/D-PATH como permiso de código; implementar adapter, DDL, endpoint, worker, side effect o acceso cross-database. | La implementación permanece `blocked_by_sol_gate` hasta un GO posterior, explícito y acotado. |
| MP-LIVE-05 | Mantenerlo documentado como residual bloqueado. | Credenciales live/sandbox en repo o CI, pagos reales, activación, muestras inventadas, HMAC propio, aliases no oficiales o usar retorno browser como prueba de cobro. | Cuenta/evidencia real gestionada fuera del repo/CI y nuevo GO Sol. |
| Baseline y restricciones | Conservar single-tenant por VM/merchant, USER separado de CUSTOMER y evidencia honesta del CI no ejecutado por billing. | Tenancy SaaS, `store_id`, `store_hosts`, TenantFilter, mezcla USER/CUSTOMER, POS/fiscal en core, deploy, secretos, tags o publish. | Cualquier cambio de alcance requiere iniciativa y gate nuevos. |
| Otros backlog/WIP | Ningún otro GO ahora. Sólo conservación documental sin ampliar alcance. | Reabrir core/UX cerrados, WIP superseded o features deferred por inferencia. | GO Sol específico futuro. |

## Respuestas

1. **¿Hay implementation GO? NO.**
2. **¿Puede Luna committear ADR-007/008 y el addendum fiscal como documentación pura? YES**, condicionado a conservar sus estados propuestos/deferred y a no implementar conectores, migrations ni capacidades.
3. **¿Puede Luna borrar o dejar los `EffectivePrice` untracked? Borrar: NO sin confirmación del dueño; dejarlos untracked y excluidos: YES.** No tienen GO y no pueden entrar en ningún commit.
4. **¿Hay GO para review documental Sol del contrato POS? YES.** No habilita código.
5. **¿Hay algún otro GO? NO.**

Este dictamen no debilita el baseline: single-tenant; USER ≠ CUSTOMER; sin POS adapter/DDL/código; sin fiscal; sin MP-LIVE-05 ni credenciales live; sin HMAC inventado; sin tenancy SaaS; sin deploy, secretos, tags o publish.
