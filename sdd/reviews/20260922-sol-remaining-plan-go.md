VERDICT: NO-GO

# Sol review — remaining executable plan

**Fecha:** 2026-09-22  
**Pregunta:** después de aterrizar las correcciones de review de MP-LIVE-03/04, ¿qué trabajo restante tiene GO para Luna ahora?

## Dictamen

**Ningún ítem adicional tiene GO de implementación para Luna.** El único carril ejecutable sigue siendo el ya autorizado para corregir MP-LIVE-03/04 en modo fail-closed, OFF/unconfigured por defecto, con doubles y sin credenciales. Este documento no amplía ese alcance.

| ID restante | Allowed | Forbidden | Blocked |
|---|---|---|---|
| MP-LIVE-03/04 — correcciones de review ya autorizadas | Conectar el checkout productivo al intento durable y al adapter OFF; comprobar que el `providerOrderId` refetched coincide con el `queryDataId` reclamado; corregir locks/idempotencia y agregar pruebas concurrentes de dos workers/acreditaciones; probar el wrapper oficial de `WebhookSignatureValidator` en aceptación, rechazo y fallo cerrado; repetir pruebas focalizadas, migración y concurrencia. | Activar sandbox/live; credenciales o secretos; HMAC propio; aliases entre `order` y `orders_v2`; usar `body.id`, notification ID o fallback como resource ID; POS/fiscal; deploy, tag o publish. | La activación y MP-LIVE-05 siguen fuera de este carril. El cierre exige evidencia verde y nueva revisión Sol del código. |
| MP-LIVE-05 | Ningún código Luna. Un operador autorizado podrá aportar después cuenta MP real, muestras saneadas y evidencia E2E fuera del repo/CI, bajo gate separado. | Inventar muestras/firmas, usar credenciales live o sandbox en repo/CI, asumir tópico, usar retorno del browser como cobro o activar pagos. | Cuenta MP real, credenciales gestionadas fuera del repo/CI, muestra real `order`/`orders_v2`, cierre de query/body `data.id`, evidencia E2E y GO Sol separado. **NO-GO por defecto.** |
| POS — `TASK-PIC-001..009` y `TASK-L3-001..003` | Ningún código, DDL, adapter, endpoint, worker ni side effect Luna. Sólo permanece el corpus documental para futura revisión Sol/Terra. | Implementar `BLACKSTORE_INTEGRATION`, `/blackstore-integration/v1`, tablas `blackstore_integration_*`, canal POS/`EXTERNAL_BLACKSTORE`, cliente BlackStore o acceso cross-database. También quedan prohibidos ISSUE/REVERSAL, `EXTERNAL`, oversell y cualquier tarea de los WIP superseded. | El contrato está `ready_for_sol_review`, **not approved**, e `implementation: blocked_by_sol_gate`. Requiere GO explícito posterior; no se infiere de que D-TTL/D-CURSOR/D-RATE/D-PATH estén documentados. |
| Fiscal — `SC-T02`, `SC-T03`, `SC-T03b`, `SC-T04`, `SC-T05`, `SC-T06`, `SC-T07` y discovery ARCA | Ningún código, DDL, capability, outbox, worker, adapter, homologación o emisión Luna. Sólo decisiones/evidencia documental por sus owners. | ARCA/fiscal en StoreCore, reutilizar `integration_outbox` por inferencia, certificados/secretos, emisión o corrección fiscal, disparar fiscal desde notificación/retorno/pago no verificado, evasión u ocultamiento. | D-01..D-07, SC-01..SC-07, matriz validada por titular/contador, manual/WSDL fechado, versión publicada de biblioteca, WIP implementable nuevo y GO Sol específico. |
| Leftovers — MP-LIVE-01/02/02A, core/UX y WIP históricos | Ningún trabajo implementable restante: MP-LIVE-01/02/02A y el baseline/UX están cerrados; conservar evidencia y no reabrir por inferencia. | Crear tareas implícitas, extender el baseline archivado, revivir tenancy SaaS, favoritos, POS/fiscal o WIP superseded; mezclar USER y CUSTOMER. | Cualquier capacidad nueva requiere WIP, trazabilidad, plan y GO explícito. Los residuales documentales no constituyen autorización de código Luna. |

## Alcance exacto para Luna ahora

Luna puede terminar únicamente los cuatro hallazgos bloqueantes de `20260922-sol-mp-live-03-code-review.md` dentro del CONDITIONAL_GO existente de MP-LIVE-03/04 y producir sus pruebas. Una vez que esas correcciones aterricen, **Luna no tiene otro ítem del plan con GO**: debe detenerse antes de MP-LIVE-05, POS y fiscal hasta un nuevo dictamen Sol.

Se mantienen sin cambios: instalación single-tenant; USER distinto de CUSTOMER; sin POS/BlackStore adapter o DDL; sin fiscal/ARCA; sin credenciales live, HMAC inventado, aliases de tópico ni `body.id` como resource ID; sin deploy, secretos, tags o publish.
