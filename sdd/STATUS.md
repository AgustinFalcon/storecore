# Estado canónico del SDD — StoreCore

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

Tramo implementable MP-LIVE-01–04 **cerrado** (fail-closed, dual Grok APPROVED). El WIP sigue `documented_deferred`; no hay `/sdd.finish` archive mientras MP-LIVE-05 esté bloqueado. Evidencia POS local está registrada abajo y el companion sigue disabled. Fiscal y live siguen NO-GO. No autoriza live vendor credentials, activación ni CI con secretos. GitHub Verify de #16–#18 falló por billing/spending limit (jobs no arrancaron); no se trata como CI verde.

## WIP POS (paralelo, no es el baseline)

- `sdd/wip/20260921-storecore-pos-integration-contract-v1/` — PIC-001..010 y L3-001..003 done a nivel local. HTTP 200/304/409/410/429 + outbox local en Testcontainers; módulo vuelve a DISABLED. Dual Grok r2 de PR #19 ambos `APPROVED` (`20260924-grok-pr19-scope-r2.md`, `20260924-grok-pr19-sdd-r2.md`). La r1 de alcance pedía base `master`; el PR ya estaba retargeteado. Verify de #19 no es CI verde. BlackStore ADP-001..010 + L3 están en el `master` de ese repo (PR #1); el release de BlackStore sigue disabled y no es companion live. Fiscal, live y `/sdd.finish` NO-GO.
- `sdd/wip/20260921-pos-sales-ingestion/` — superseded.
- `sdd/wip/20260921-blackstore-pos-operations/` — puntero histórico.

## Fiscal externo

- `20260921-arca-fiscal-discovery` y `20260921-arca-storecore-adapter-contract`: `documented_deferred`. Addendum 2026-09-22 de pago/fiscal es propuesta Open. Sin código, DDL, worker ni secretos.

## Mercado Pago Checkout Pro (WIP separado)

- `sdd/wip/20260922-storecore-mp-live-checkout-v1/`: Checkout Pro externo en la misma ventana mediante Orders API, `documented_deferred`.
- MP-LIVE-01–04 fail-closed cerrados (Sol + dual Grok APPROVED). MP-LIVE-05, pagos reales y fiscal siguen NO-GO.
