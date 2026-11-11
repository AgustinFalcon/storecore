# Estado canónico del SDD — StoreCore

## Master vigente y cierre de gates posteriores a stock — 2026-11-11

`master 970dc69ed439d98175bc1219134756ec29dc09f2` integra PR #240 y el
follow-up PR #241. El ajuste manual de stock conserva autoridad, idempotencia,
auditoría y estados cerrados; el follow-up elimina dos carreras observadas por
el primer Verify de `master`: pérdida de foco durante el refresh autoritativo y
una segunda rotación USER CSRF desde `ShellComponent`.

PR #241 fue revisado sobre el head exacto
`651a8333b07bd17ba78c3e91a35d55a19a52e178` por dos gates GPT-6.1 Sol
independientes (Bug/Producto y Seguridad), ambos `APPROVE` sin P0–P3. Verify de
PR `42905934287` y Verify post-merge de `master` `42907008862` terminaron 3/3
verdes: backend, frontend y `unified-access-real-e2e` con PostgreSQL, Spring,
Angular HTTPS y navegador real.

Este cierre acredita el core local homologable del corte actual. No acredita
credenciales live, Mercado Pago real, ARCA, Correo Argentino, StoreCore↔BlackStore
activo, deploy ni `release/1.0`; esos límites permanecen bloqueados por sus WIP
y homologaciones específicas.

## Política de revisión vigente

Desde 2026-10-03, el gate de revisión para PRs nuevos es **dos revisiones independientes GPT-6.1 Sol en paralelo**, con proveedor, modelo, esfuerzo, SHA base/head, checks y límites registrados. Las referencias a Grok en documentos históricos describen evidencia de cortes anteriores y no son un requisito vigente para nuevos PRs.

**Validado:** 2026-09-23  
**Madurez:** `storecore-core-v1.0.0` archivado en `sdd/features/20260921-single-tenant-installation-baseline/`. Integración: PR #14. No existe TASK-011.  
**Sol GO:** `sdd/reviews/20260922-sol-go-core.md`.  
**Git:** feature branch + finish en el PR. No tag, deploy o publish.

## Residuales honestos

- TASK-008/014 inbox persist-before-ACK done. TODO-041 worker applies only after official refetch (fake in CI; live credentials per installation, never in repo).
- TASK-013: Playwright/axe on public screens (`frontend` `npm run test:a11y`). Stitch is a visual reference, not a pixel baseline.
- TODO-003: fleet runbook complete at `sdd/features/20260921-single-tenant-installation-baseline/2-technical/fleet-operations.md`.

## Precedencia

1. Feature archivado: `sdd/features/20260921-single-tenant-installation-baseline/`.
2. `sdd/PROJECT.md`, `sdd/PATTERNS.md`, `sdd/TRACEABILITY.md`, `sdd/RELEASE.md`.
3. `docs/agent/` es espejo; Company Brain canónico vive en `Novastra/company brain`.
4. `20260819-store-tenancy-and-profiles` y `sdd/specs/*` son históricos/superseded.

## Frontend vigente y procedencia visual

- `sdd/wip/20260923-storecore-frontend-ux-system-v1/` conserva la procedencia visual Stitch; su inventario de 22 rutas es histórico.
- La aceptación ejecutable de las 26 superficies Demo está en `sdd/wip/20261014-storecore-commercial-ux-hardening/4-implementation/evidence/frontend-phase1-client-presentation-closure-20261106.md`; no acredita paridad backend ni proveedores reales.
- El manifiesto PSD registra 25 superficies con ruta productiva y recovery bloqueado por contrato de email. PSD quedó archivado en `sdd/features/20261108-storecore-productive-surface-data-parity/`; Showcase quedó archivado en `sdd/features/20261108-storecore-local-showcase-environment/` como completado mediante hardening sucesor. Ninguno acredita proveedores live ni homologación.
- La navegación paginada local está cerrada en `sdd/features/20261109-storecore-bounded-list-navigation/` (PR #234, candidato `4e99400`, Verify `42675235368`).
- El editor productivo de variantes existentes está cerrado en `sdd/features/20261110-storecore-productive-variant-editor/` (PR #238, candidato `a863a8d`, Verify `42833927010` 3/3 y doble review GPT-6.1 Sol APPROVE). Nombre, estado cerrado y atributos son editables; identidad/SKU, stock, precio y proveedores permanecen fuera de alcance.
- El estado de health del frontend está cerrado en `sdd/features/20261110-storecore-closed-health-status/` (PR #239, candidato `35ae0c3`, Verify `42839213825` intento #2 3/3 y doble review GPT-6.1 Sol APPROVE). El wire se traduce una sola vez; valores futuros o malformados quedan `Unknown` fail-closed y nunca marcan la instalación lista.

## Gate actual

El inventario vigente distingue Demo, operaciones productivas locales y bloqueos externos; un conteo de rutas no acredita completitud operativa. Una `checkoutUrl` HTTPS allowlisted es redirección UX, no prueba de cobro. No autoriza release, fiscal/ARCA, tenancy SaaS, DEMO-as-production ni deploy.

### Estrategia de ramas para homologación

- `master` recibe por PRs pequeños el core homologable, seguridad y endurecimientos fail-closed. Cada corte se valida sobre el SHA exacto de `master`; el CI de una rama de integración no se reutiliza como evidencia.
- `integration/storecore-int` conserva la historia y la evidencia combinada POSC/DSP/companion. No se retargetea ni se fusiona completa sobre `master`.
- La integración operativa StoreCore↔BlackStore se arma en `release/1.0` desde el `master` homologado sólo cuando facturación/ARCA y Correo Argentino tengan contratos, adapters y E2E de homologación aprobados. Hasta entonces sigue desactivada, sin credenciales live ni canary.
- Las migraciones ya publicadas no se borran ni renumeran; cualquier separación se hace hacia adelante y con prueba de instalación limpia y upgrade.

La promoción vigente se registra en `sdd/wip/20261002-master-core-hardening/4-implementation/progress.md`; ese addendum separa la procedencia de integración de la evidencia ejecutada sobre el diff real de `master`.

### Acceso unificado StoreCore

`unified-access-entry` está implementado mediante PRs #165–#169 y archivado en
`sdd/features/20261003-unified-access-entry/`. `/login` es la única entrada
visual, pero CUSTOMER y USER conservan principals, cookies, CSRF, sesiones y
autorización separados. El corte funcional de #169 es
`99380a656562c784dc8fc4805eccc2a835a2ea48`; la evidencia real está en Verify
`37526296154` (12/12 PostgreSQL/Spring/Angular HTTPS/Chromium), repetida en
`master` por `37528646167`, y en dos reviews
independientes GPT-6.1 Sol del head exacto. El inventario UA-007 encontró
consumidores ejecutables de los endpoints de credenciales por realm: permanecen
soportados y no deprecados. Su eventual retiro es `TODO-043`. BlackStore no está
federado y este estado no autoriza deploy ni homologación fiscal/carrier.

Tramo implementable MP-LIVE-01–04 **cerrado** (fail-closed, dual Grok APPROVED). El WIP sigue `documented_deferred`; no hay `/sdd.finish` archive mientras MP-LIVE-05 esté bloqueado. Evidencia POS local está registrada abajo y el companion sigue disabled. Fiscal y live siguen NO-GO. No autoriza live vendor credentials, activación ni CI con secretos. GitHub Verify de #16–#18 falló por billing/spending limit (jobs no arrancaron); no se trata como CI verde.

## WIP POS (paralelo, no es el baseline)

- `sdd/wip/20260921-storecore-pos-integration-contract-v1/` — PIC-001..010 y L3-001..003 done a nivel local. HTTP 200/304/409/410/429 + outbox local en Testcontainers; módulo vuelve a DISABLED. PR #19 mergeado en `master` (`18d18f7`) tras dual Grok r2 ambos `APPROVED` (`20260924-grok-pr19-scope-r2.md`, `20260924-grok-pr19-sdd-r2.md`). Verify de #19 no es CI verde. El WIP sigue abierto: companion live, fiscal, MP-LIVE-05 y `/sdd.finish` NO-GO. BlackStore ADP-001..010 + L3 están en el `master` de ese repo. PR #2 (`395ca30`) es el perfil opt-in `loopback`. PR #5 (`c5f6239`) ata el reserve a la variante del catálogo vigente. El release de BlackStore sigue disabled y no es companion live. Fiscal, live y `/sdd.finish` NO-GO.
- `sdd/wip/20260921-pos-sales-ingestion/` — superseded.
- `sdd/wip/20260921-blackstore-pos-operations/` — puntero histórico.

## Fulfillment comercial — aceptación cerrada y SDD archivado

`sdd/features/20261006-commerce-closed-states-and-fulfillment-eligibility/`
conserva el GO documental y la implementación de PR #171, revalidada sobre el
head final de PR #231 `9108798818b0217dcf5bb4685f59a195d63637ae` (merge
`eca9db9f0ba51023c8b785831003cb04d8ba0660`).
Implementa tipos cerrados,
prueba durable de acreditación/SALE WEB, locks order-first y recepción completa
sin inspección ni reposición. En el antecedente PR #171, head `b3e4b3b`, Verify
exact-head `37630043935` terminó success
en frontend, backend y `unified-access-real-e2e`; dos reviews independientes
GPT-6.1 Sol APPROVED sin P0–P3 verificaron ese head y el fingerprint
`459CB299E61B864DB52A5B3E2FB676BC213BA1C94307731BAC5E54F115647572`.
Verify exact-head #594, run `42538029894`, terminó success en frontend, backend
y browser: 1061 tests frontend, 253 backend y 17/17 escenarios (4 CFE reales,
1 Unknown MockHttp y 12 de acceso). La matriz incluye PostgreSQL 16, clean V1–V14, upgrade V8→V9 y
V13→V14, checksums/histórico, autorización, concurrencia, respuesta perdida y
recuperación durable. El candidato documental `4debf9b` pasó Verify
`42653866473` con 3/3 jobs y doble review GPT-6.1 Sol APPROVE; CFE-T06 quedó
cerrada y el SDD archivado. No se afirma CI push de master. Sin homologación,
release, credenciales live ni activación. Progreso/evidencia y límites están en el feature.
La disposición/reposición por ítem quedó cerrada en
`sdd/features/20261109-commerce-rma-item-disposition-and-restock/`: sólo
RESTOCK aumenta stock vendible; dañado/rechazado, idempotencia, auditoría,
recovery y carreras están cubiertos. PR #233 candidato `fc80316`, Verify
`42666041072` 3/3 y doble review GPT-6.1 Sol APPROVE. Sin homologación,
release, credenciales live ni deploy.

## Fiscal externo

- `20260921-arca-fiscal-discovery` y `20260921-arca-storecore-adapter-contract`: `documented_deferred`. Addendum 2026-09-22 de pago/fiscal es propuesta Open. Sin código, DDL, worker ni secretos.

## Mercado Pago Checkout Pro (WIP separado)

- `sdd/wip/20260922-storecore-mp-live-checkout-v1/`: Checkout Pro externo en la misma ventana mediante Orders API, `documented_deferred`.
- MP-LIVE-01–04 fail-closed cerrados (Sol + dual Grok APPROVED). MP-LIVE-05, pagos reales y fiscal siguen NO-GO.
