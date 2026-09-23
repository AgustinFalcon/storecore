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

## WIP frontend UX (doc + Stitch, sin código)

- `sdd/wip/20260923-storecore-frontend-ux-system-v1/` — sistema visual canónico. Stitch `projects/6473866243657965808`. P-01 retail recupera banner carousel + tira de ofertas del mock viejo, sin piel ML. Reviews UX/PO/comprador: el P-01 “sparse” no es vidriera. Sin implementación Angular en este WIP.

## Gate actual

Plan frontend UX (`docs/agent/frontend/ux-handoff.md`) **cerrado en código de views**: DS-00…U-10 existen, sin favoritos ni SDK/credenciales de Mercado Pago en el browser. El **sistema visual SDD/Stitch** es el WIP de arriba; no sustituye Company Brain. Una `checkoutUrl` HTTPS allowlisted es redirección UX, no prueba de cobro. No autoriza release, POS/BlackStore adapter, fiscal/ARCA, tenancy SaaS, DEMO-as-production ni deploy.

Tramo implementable MP-LIVE-01–04 **cerrado** (fail-closed, dual Grok APPROVED). El WIP sigue `documented_deferred`; no hay `/sdd.finish` archive mientras MP-LIVE-05 esté bloqueado. POS y fiscal siguen NO-GO. No autoriza live vendor credentials, activación ni CI con secretos. GitHub Verify de #16–#18 falló por billing/spending limit (jobs no arrancaron); no se trata como CI verde.

## WIP POS (paralelo, no es el baseline)

- `sdd/wip/20260921-storecore-pos-integration-contract-v1/` — Sol next-go `20260923-sol-pos-next-go.md` = CONDITIONAL_GO PIC-010 + ACTIVE temporal Testcontainers. En rama: PIC-001/002/008/010 done (V7 flip; módulo sigue DISABLED). PIC-003..007 y PIC-009 in_progress (HTTP 403 baseline; catalog/stock 200 sólo en test CAS temporal). Companion live, fiscal y MP-LIVE-05 NO-GO. No archive.
- `sdd/wip/20260921-pos-sales-ingestion/` — superseded.
- `sdd/wip/20260921-blackstore-pos-operations/` — puntero histórico.

## Fiscal externo

- `20260921-arca-fiscal-discovery` y `20260921-arca-storecore-adapter-contract`: `documented_deferred`. Addendum 2026-09-22 de pago/fiscal es propuesta Open. Sin código, DDL, worker ni secretos.

## Mercado Pago Checkout Pro (WIP separado)

- `sdd/wip/20260922-storecore-mp-live-checkout-v1/`: Checkout Pro externo en la misma ventana mediante Orders API, `documented_deferred`.
- MP-LIVE-01–04 fail-closed cerrados (Sol + dual Grok APPROVED). MP-LIVE-05, pagos reales y fiscal siguen NO-GO.
