# Meta — proyección de stock deseado para Mercado Libre

- **Feature id:** `20260924-ml-desired-stock-projection`
- **Feature UUID:** `4cb2fdb0-14d4-4fe5-87ae-34858300b63a`
- **Status:** `ready_for_implementation` — TASK-DSP-R00 tiene GO documental Astra para iniciar 000A/000B; código y resto del DAG siguen sujetos a sus gates
- **Mode:** `standard`
- **Project type / stack:** producción / backend Kotlin-Spring Boot + PostgreSQL 16
- **Related baseline:** `sdd/features/20260921-single-tenant-installation-baseline/`
- **Related WIP:** `20260922-ml-inbox-integrity` persiste la evidencia de una venta ML, pero no es caller de esta feature. Un futuro `ml-inbox-to-projection`, condicionado a binding oficial y refetch, definirá la unión. `20260921-storecore-pos-integration-contract-v1` sigue bloqueado y no es caller de esta feature.

## Objetivo

Derivar, de modo transaccional y repetible, el stock que una cuenta Mercado Libre autorizada **debería** publicar por cada listing activo: `max(0, available_quantity - safety_stock)`. El saldo `available_quantity` ya es neto de reservas; por eso esta regla no vuelve a restar `reserved_quantity`.

La feature sólo materializa una proyección local y una intención durable `STOCK_DESIRED_CHANGED` con delivery `PENDING`. No envía a Mercado Libre, no usa credenciales, no reclama deliveries y no marca `SENT`, `FAILED` ni `DEAD`.

La proyección no consume un caller ML activo en esta feature. Una fila durable no prueba por sí sola binding, firma ni identidad de cuenta. Un futuro caller sólo podrá invocarla mediante un contexto que su propio contrato haya validado por binding único y refetch oficial; hasta entonces ingress/webhook/`notify` permanecen deshabilitados para la proyección.

## Límites y precondiciones

- Base de implementación verificada el 2026-09-27: `integration/storecore-int` en `ab817891abb6c7b710bca809804d924401ed74f0`, con PIC-009 `69f209b` como ancestro y Flyway V1–V7; V8 libre en esa base. El checkout de redacción de este WIP sigue en `a886f48`. Antes de migrar se revalida si integración avanzó.

- Una instalación continúa siendo un comercio, una VM y una base. No hay `store_id`, cross-DB, shared runtime, POS ni BlackStore.
- La proyección se limita a cuentas de propósito externo Mercado Libre autorizadas y capability `MARKETPLACE_ML` en `ACTIVE`. Una cuenta interna que soporte precios/promos manuales no es elegible aunque comparta tablas de listings.
- La rama de integración puede conservar temporalmente el literal histórico `manual-price-writer`; esta feature no lo toma como contrato. Toda cuenta histórica queda `UNCLASSIFIED` y fail-closed hasta clasificación auditada; cada operación usa `account_id` explícito y valida propósito tipado antes de crear proyecciones.
- No modifica la evidencia comercial `SALE_APPLIED`, no cambia `channel_sales` ni intenta despachar outbox. El despacho real, credenciales, OAuth, API oficial y reintentos remotos se difieren.
- Ningún flujo BlackStore consume esta proyección ni puede provocarla hasta que PIC-005 tenga GO explícito.

## Compatibilidad explícita con PIC-009 local

El commit `69f209b`, ya contenido por `master` `a886f48`, introdujo un adapter BlackStore local que, durante la activación temporal de su capability en pruebas, actualiza `desired_quantity` y agrega `channel_outbox.kind=LISTING_STOCK` después del commit. Aunque el módulo queda `DISABLED` fuera de esa evidencia y no hay conector remoto, ese writer directo existe: no puede coexistir como segundo owner con el proyector canónico ni presentarse como sólo histórico.

Antes de que `DesiredStockProjectionUseCase` sea owner de `desired_quantity`, una tarea explícita debe sellar el writer PIC-009: conservar las filas `LISTING_STOCK` existentes como evidencia inmutable, retirar del adapter toda escritura nueva directa a `desired_quantity` y `LISTING_STOCK`, y dejar un puente de aplicación fail-closed que no produzca cambios mientras el proyector canónico no esté disponible. El puente no habilita BlackStore, no hace red y mantiene `BLACKSTORE_INTEGRATION=DISABLED`; sólo después de GO de PIC-005 y de que el proyector canónico exista podrá delegarle una causa local versionada. La prueba de sellado precede a cualquier ownership canónico y demuestra que incluso una activación temporal de fixture no permite al adapter legacy mutar `desired_quantity` ni insertar `LISTING_STOCK`. No se permite reescribir, borrar ni convertir outbox histórico; el nuevo kind `STOCK_DESIRED_CHANGED` coexistirá de forma distinguible.

## Fases SDD

| Fase | Estado |
|---|---|
| 1 — Functional Spec | `ready_for_implementation` (R00 GO documental) |
| 2 — Technical Spec | `ready_for_implementation` (R00 GO documental) |
| 3 — Tasks | `ready_for_implementation` (R00 GO documental) |
| 4 — Implementation | `in_progress` (000A done sólo localmente; sin PR ni merge) |

## Gate de salida

El GO documental Astra de TASK-DSP-R00 está en `sdd/reviews/20260927-astra-ml-desired-stock-r00-go.md` y habilita iniciar 000A/000B, no otros pasos fuera del DAG. Después de implementar: tests PG16/Testcontainers y dos reviews de código independientes, con correcciones y nueva revisión si aparecen hallazgos. Cada PR va a la rama de integración tras esos gates y verificaciones locales; el paso de integración a master exige CI remoto verde. Este WIP no está aprobado, no autoriza `sdd.finish`, release, deploy ni activación ML/BlackStore.

El dictamen R00 vigente ya se pronunció sobre snapshot único action/config/kill mediante SECURITY DEFINER y permisos PG16, orden de locks de callers, releaseSaga WEB y base/Flyway de integración. Antes de aplicar la migración 000B se revalida la base real y sus permisos; ese GO documental no aprueba código, PR, release ni activación live.
