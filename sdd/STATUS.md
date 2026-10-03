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

Tramo implementable MP-LIVE-01–04 **cerrado** (fail-closed, dual Grok APPROVED). El WIP sigue `documented_deferred`; no hay `/sdd.finish` archive mientras MP-LIVE-05 esté bloqueado. Evidencia POS local está registrada abajo y el companion sigue disabled. Fiscal y live siguen NO-GO. No autoriza live vendor credentials, activación ni CI con secretos. GitHub Verify de #16–#18 falló por billing/spending limit (jobs no arrancaron); no se trata como CI verde.

## WIP POS (paralelo, no es el baseline)

- `sdd/wip/20260921-storecore-pos-integration-contract-v1/` — PIC-001..010 y L3-001..003 done a nivel local. HTTP 200/304/409/410/429 + outbox local en Testcontainers; módulo vuelve a DISABLED. PR #19 mergeado en `master` (`18d18f7`) tras dual Grok r2 ambos `APPROVED` (`20260924-grok-pr19-scope-r2.md`, `20260924-grok-pr19-sdd-r2.md`). Verify de #19 no es CI verde. El WIP sigue abierto: companion live, fiscal, MP-LIVE-05 y `/sdd.finish` NO-GO. BlackStore ADP-001..010 + L3 están en el `master` de ese repo. PR #2 (`395ca30`) es el perfil opt-in `loopback`. PR #5 (`c5f6239`) ata el reserve a la variante del catálogo vigente. El release de BlackStore sigue disabled y no es companion live. Fiscal, live y `/sdd.finish` NO-GO.
- `sdd/wip/20260921-pos-sales-ingestion/` — superseded.
- `sdd/wip/20260921-blackstore-pos-operations/` — puntero histórico.

## Fiscal externo

- `20260921-arca-fiscal-discovery` y `20260921-arca-storecore-adapter-contract`: `documented_deferred`. Addendum 2026-09-22 de pago/fiscal es propuesta Open. Sin código, DDL, worker ni secretos.

## Mercado Pago Checkout Pro (WIP separado)

- `sdd/wip/20260922-storecore-mp-live-checkout-v1/`: Checkout Pro externo en la misma ventana mediante Orders API, `documented_deferred`.
- MP-LIVE-01–04 fail-closed cerrados (Sol + dual Grok APPROVED). MP-LIVE-05, pagos reales y fiscal siguen NO-GO.
