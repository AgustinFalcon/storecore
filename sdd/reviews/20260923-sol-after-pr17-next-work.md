VERDICT: NO_GO

# Sol gate — next work after PR #17

**Fecha:** 2026-09-23  
**Baseline revisado:** `master` @ `90849b6`  
**Alcance:** trabajo posterior al merge documental de ADR-007/008 y addendum fiscal.

## Decisión ejecutiva

No hay implementation GO para Luna. El pedido de “finish everything” no sustituye los gates del SDD ni aporta las dependencias externas pendientes. MP-LIVE-01–04 ya están cerrados fail-closed; no deben reabrirse ni ampliarse. MP-LIVE-05, el conector POS, fiscal, `EffectivePrice` y TODO-030..038 permanecen sin autorización de implementación.

Tampoco hay un nuevo carril documental general para Luna. La segunda revisión documental del contrato POS ya fue lanzada por separado y debe completar su propio dictamen; no se duplica aquí ni habilita código. El addendum fiscal permanece `documented_deferred`, con todos sus gates Open. Sólo puede incorporarse en el futuro evidencia oficial fechada y decisiones reales del titular/contador dentro de su WIP, mediante un encargo documental explícito; está prohibido completar huecos por inferencia.

## Allowed / Forbidden / Blocked

### Mercado Pago

- **Allowed:** conservar MP-LIVE-01–04 cerrados y fail-closed; mantener MP-LIVE-05 como residual bloqueado y documentar evidencia saneada auténtica cuando exista y haya un gate nuevo.
- **Forbidden:** sandbox o live E2E, credenciales en repo/CI, pagos reales, activación, aliases o muestras inventadas, HMAC propio, tratar el retorno browser como prueba de cobro, deploy, tag o publish.
- **Blocked:** MP-LIVE-05 requiere cuenta/evidencia real gestionada fuera del repo/CI y un nuevo GO Sol explícito. **Implementation GO: NO.**

### POS / BlackStore

- **Allowed:** completar únicamente la revisión documental r2 ya abierta y las correcciones documentales que ese carril ordene, manteniendo `ready_for_sol_review` e `implementation: blocked_by_sol_gate`.
- **Forbidden:** ports, DTOs, fixtures runtime, endpoints, adapter/cliente, DDL/Flyway, workers de expiry/cleanup/purge, capability activa, acceso cross-database, ISSUE/REVERSAL, `channel=POS` o resurrección de WIP superseded.
- **Blocked:** un conector real exige contrato documental aprobado y un dictamen posterior con GO de implementación inequívoco y tareas concretas. ADR-007/008 y su reconciliación no son ese GO. **Implementation GO: NO.**

### Fiscal / ARCA

- **Allowed:** conservar discovery, contrato y addendum como `documented_deferred`; registrar únicamente fuentes oficiales fechadas y decisiones auténticas cuando estén disponibles.
- **Forbidden:** código, DDL, capability, inbox/outbox fiscal, worker, adapter, homologación, emisión, certificados, secretos, evasión, ocultamiento o activar propuestas abiertas por inferencia.
- **Blocked:** D-01..D-07, SC-01..SC-07, matriz titular/contador, manual/contrato oficial fechado, biblioteca externa publicable y nuevo GO Sol específico. **Implementation GO: NO.**

### `EffectivePrice*.kt`

- **Allowed:** dejarlos untracked, excluidos de commits y sin uso.
- **Forbidden:** integrarlos, probarlos como feature autorizada, incluirlos en un PR o borrarlos sin confirmación del dueño.
- **Blocked:** no existe WIP, plan, trazabilidad ni GO; el dueño no confirmó su eliminación. **Implementation GO: NO.**

### Backlog TODO-030..038

- **Allowed:** conservar su clasificación deferred y sus restricciones actuales.
- **Forbidden:** implementar market intelligence, automatización de precios/promociones, cross-sell, calendario, kits, favoritos, loyalty o carriers por inferencia desde el backlog.
- **Blocked:** cada ítem necesita WIP propio, contratos/evidencia aplicables, trazabilidad, plan y GO Sol para tareas concretas. **Implementation GO: NO.**

### Cualquier otro trabajo

- **Allowed:** mantenimiento documental estrictamente necesario para reflejar hechos ya aprobados, mediante encargo explícito y sin cambiar estados de gate.
- **Forbidden:** ampliar core/UX cerrados, tenancy SaaS, `store_id`, `store_hosts`, TenantFilter, mezclar USER/CUSTOMER, usar DEMO como producción, secretos, tag, deploy o publish.
- **Blocked:** toda capacidad nueva requiere iniciativa SDD y GO Sol separado. **Implementation GO: NO.**

## Documentary GO restante

1. **POS contract r2:** YES sólo para el carril documental ya lanzado por separado; no duplicar trabajo y no interpretar su eventual aprobación como permiso de implementación.
2. **Fiscal/addendum:** NO como tarea abierta para “terminar todo”. Sólo futura recopilación documental de evidencia oficial y decisiones reales, con encargo acotado; no inventar cierres.
3. **MP-LIVE-05:** NO mientras no existan cuenta/evidencia auténtica y un nuevo gate.
4. **Otros backlog/WIP:** NO.

## `/sdd.finish`

- **MP-LIVE:** NO. MP-LIVE-05 permanece bloqueado y el WIP debe seguir `documented_deferred`.
- **POS:** NO. El corpus sigue en revisión documental y la implementación continúa `blocked_by_sol_gate`.
- Una aprobación documental futura del POS no basta por sí sola para archivar ni para implementar.

## Respuestas explícitas

1. **¿Hay algún implementation GO para Luna ahora? NO.**
2. **¿Hay nuevo documentary GO para Luna? NO.** Sólo continúa, fuera de este gate, el POS contract r2 ya lanzado; cualquier corrección se limita a documentación.
3. **¿Puede Luna ejecutar `/sdd.finish` sobre MP-LIVE o POS? NO / NO.**
4. **¿Qué hacer con `EffectivePrice*.kt`? Dejarlos untracked; NO borrar sin confirmación del dueño.**

Este NO_GO preserva el baseline single-tenant por instalación, USER separado de CUSTOMER y los límites fail-closed. No autoriza HMAC inventado, credenciales live, POS/fiscal code, tenancy SaaS, secretos, tag, deploy ni publish.
