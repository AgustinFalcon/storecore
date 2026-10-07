# Estado canónico del SDD — StoreCore

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

## WIP frontend UX (doc + Stitch + volcado de tokens)

- `sdd/wip/20260923-storecore-frontend-ux-system-v1/` — sistema visual canónico. Stitch `projects/6473866243657965808`. UX-ANG aplicado en las 22 rutas existentes (tokens navy/canvas/accent). No había HTML Stitch archivado para P-01/P-02/P-03; esas tres se alinearon al DS y a las views previas. No es pixel-complete ni archive. Sin SDK MP.

## Gate actual

UX-ANG está aplicado en las 22 rutas existentes. No es pixel-complete. Una `checkoutUrl` HTTPS allowlisted es redirección UX, no prueba de cobro. No autoriza release, fiscal/ARCA, tenancy SaaS, DEMO-as-production ni deploy.

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

## Fulfillment comercial — PR #171 integrado, WIP abierto

`sdd/wip/20261006-commerce-closed-states-and-fulfillment-eligibility/` tiene
Sol GO documental registrado y PR #171 MERGED: head
`b3e4b3baa47f3abdabd4140b3bbcee975e4c3474`, merge `84f1b025`.
Implementa tipos cerrados,
prueba durable de acreditación/SALE WEB, locks order-first y recepción completa
sin inspección ni reposición. Verify exact-head `37630043935` terminó success
en frontend, backend y `unified-access-real-e2e`; dos reviews independientes
GPT-6.1 Sol APPROVED sin P0–P3 verificaron ese head y el fingerprint
`459CB299E61B864DB52A5B3E2FB676BC213BA1C94307731BAC5E54F115647572`.
No hubo CI push de master. Browser CFE específico, clean/upgrade y cualquier
variante de aceptación sin evidencia explícita siguen pendientes; acceso
unificado real no equivale a aceptación browser de fulfillment. Sin archive,
homologación, release ni activación. Progreso/evidencia y límites están en el WIP.
Disposición/reposición por ítem se difiere al backlog `TODO-045`.

## Fiscal externo

- `20260921-arca-fiscal-discovery` y `20260921-arca-storecore-adapter-contract`: `documented_deferred`. Addendum 2026-09-22 de pago/fiscal es propuesta Open. Sin código, DDL, worker ni secretos.

## Mercado Pago Checkout Pro (WIP separado)

- `sdd/wip/20260922-storecore-mp-live-checkout-v1/`: Checkout Pro externo en la misma ventana mediante Orders API, `documented_deferred`.
- MP-LIVE-01–04 fail-closed cerrados (Sol + dual Grok APPROVED). MP-LIVE-05, pagos reales y fiscal siguen NO-GO.
