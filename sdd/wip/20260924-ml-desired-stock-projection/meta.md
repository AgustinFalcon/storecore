# Meta — proyección de stock deseado para Mercado Libre

- **Feature id:** `20260924-ml-desired-stock-projection`
- **Feature UUID:** `4cb2fdb0-14d4-4fe5-87ae-34858300b63a`
- **Status:** `implementable_dag_merged` — DAG 000A–009 mergeado sólo en integración (`8da8392`, PR #97 / issue #96). El WIP permanece abierto: sin dispatcher, live ML/BlackStore ni `sdd.finish`
- **Mode:** `standard`
- **Project type / stack:** producción / backend Kotlin-Spring Boot + PostgreSQL 16
- **Related baseline:** `sdd/features/20260921-single-tenant-installation-baseline/`
- **Related WIP:** `20260922-ml-inbox-integrity` persiste la evidencia de una venta ML, pero no es caller de esta feature. Un futuro `ml-inbox-to-projection`, condicionado a binding oficial y refetch, definirá la unión. `20260921-storecore-pos-integration-contract-v1` sólo aporta el bridge local in-saga integrado por TASK-DSP-009; no habilita companion live ni red.

## Objetivo

Derivar, de modo transaccional y repetible, el stock que una cuenta Mercado Libre autorizada **debería** publicar por cada listing activo: `max(0, available_quantity - safety_stock)`. El saldo `available_quantity` ya es neto de reservas; por eso esta regla no vuelve a restar `reserved_quantity`.

La feature sólo materializa una proyección local y una intención durable `STOCK_DESIRED_CHANGED` con delivery `PENDING`. No envía a Mercado Libre, no usa credenciales, no reclama deliveries y no marca `SENT`, `FAILED` ni `DEAD`.

La proyección no consume un caller ML activo en esta feature. Una fila durable no prueba por sí sola binding, firma ni identidad de cuenta. Un futuro caller sólo podrá invocarla mediante un contexto que su propio contrato haya validado por binding único y refetch oficial; hasta entonces ingress/webhook/`notify` permanecen deshabilitados para la proyección.

## Límites y precondiciones

- Base documental inicial verificada el 2026-09-27: `integration/storecore-int` en `ab817891abb6c7b710bca809804d924401ed74f0`, con PIC-009 `69f209b` como ancestro y Flyway V1–V7; V8 libre en esa base. Tras PR #52, integración avanzó a `56baa2db2d6fabbd683ce41459414c556cb5246d`. El checkout de redacción inicial estaba en `a886f48`; esos snapshots documentan el diseño histórico. 000B está integrado y, antes de cualquier delta nuevo, se revalidan HEAD, migraciones y permisos reales.

- Una instalación continúa siendo un comercio, una VM y una base. No hay `store_id`, cross-DB ni shared runtime. El bridge local BlackStore de TASK-DSP-009 puede solicitar la proyección en la transacción de saga; no convierte POS/BlackStore en live ni comparte bases.
- La proyección se limita a cuentas de propósito externo Mercado Libre autorizadas y capability `MARKETPLACE_ML` en `ACTIVE`. Una cuenta interna que soporte precios/promos manuales no es elegible aunque comparta tablas de listings.
- La rama de integración puede conservar temporalmente el literal histórico `manual-price-writer`; esta feature no lo toma como contrato. Toda cuenta histórica queda `UNCLASSIFIED` y fail-closed hasta clasificación auditada; cada operación usa `account_id` explícito y valida propósito tipado antes de crear proyecciones.
- No modifica la evidencia comercial `SALE_APPLIED`, no cambia `channel_sales` ni intenta despachar outbox. El despacho real, credenciales, OAuth, API oficial y reintentos remotos se difieren.
- TASK-DSP-009 integró el bridge local BlackStore dentro de la saga, después de los cortes POSC aplicables. Con `MARKETPLACE_ML` no ACTIVE devuelve `NOT_ELIGIBLE`; no hay dispatcher, credenciales, red ni activación BlackStore live.

## Compatibilidad explícita con PIC-009

El commit `69f209b`, ya contenido por `master` `a886f48`, introdujo un adapter BlackStore local que, durante la activación temporal de su capability en pruebas, actualizaba `desired_quantity` y agregaba `channel_outbox.kind=LISTING_STOCK` después del commit. Ese writer directo fue sellado por PR #52 en integración; los datos ya escritos permanecen históricos e inmutables. El adapter original no podía coexistir como segundo owner con el proyector canónico.

TASK-DSP-000A selló ese writer en PR #52, mergeado sólo a integración en `56baa2d`: conserva las filas `LISTING_STOCK` como evidencia inmutable, retiró del adapter toda escritura nueva directa a `desired_quantity` y `LISTING_STOCK`, y dejó un puente de aplicación fail-closed sin cambios mientras el proyector canónico no esté disponible. El puente no habilita BlackStore, no hace red y mantiene `BLACKSTORE_INTEGRATION=DISABLED` fuera del fixture de prueba; sólo después de GO de PIC-005 y de que el proyector canónico exista podrá delegarle una causa local versionada dentro de la transacción canónica. La prueba de sellado precede a cualquier ownership canónico y demuestra que incluso una activación temporal de fixture no permite al adapter legacy mutar `desired_quantity` ni insertar `LISTING_STOCK`. No se permite reescribir, borrar ni convertir outbox histórico; el nuevo kind `STOCK_DESIRED_CHANGED` coexistirá de forma distinguible.

## Fases SDD

| Fase | Estado |
|---|---|
| 1 — Functional Spec | `ready_for_implementation` (R00 GO documental) |
| 2 — Technical Spec | `ready_for_implementation` (R00 GO documental) |
| 3 — Tasks | `ready_for_implementation` (R00 GO documental) |
| 4 — Implementation | `implementable_dag_merged` (15/15 registros de tarea done, incluido TASK-DSP-009; WIP abierto, dispatcher/live/`sdd.finish` NO-GO) |

## Gate de salida

El GO documental Astra de TASK-DSP-R00 está en `sdd/reviews/20260927-astra-ml-desired-stock-r00-go.md` y habilitó 000A/000B, no pasos fuera del DAG. Los cortes implementables 000A–009 se integraron con pruebas y reviews por PR. Hosted CI verde es condición necesaria, no autorización de promoción: sólo un dossier Carril A con sus gates puede promover comercio web; companion permanece en integración. Este WIP no autoriza `sdd.finish`, release, deploy, dispatcher ni activación ML/BlackStore.

El dictamen R00 se pronunció sobre snapshot único action/config/kill mediante SECURITY DEFINER y permisos PG16, orden de locks de callers, releaseSaga WEB y base/Flyway de integración. El gate previo a 000B exigió revalidar la base real y sus permisos; aquel GO documental no sustituye evidencia de código ni autoriza release o activación live.

La evidencia de PR #52 y de sus pruebas/reviews está en `sdd/reviews/20260927-ml-dsp-000a-pr52-integration.md`. Su CI alojado histórico falló con `steps=[]`; Verify posterior #118/#120 ejecutó steps y pasó, sin convertir aquel run en pass ni habilitar `sdd.finish`, master o live.
