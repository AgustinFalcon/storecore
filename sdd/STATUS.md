# Estado canónico del SDD — StoreCore

**Validado:** 2026-09-22  
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

## Gate actual

Plan frontend UX (`docs/agent/frontend/ux-handoff.md`) **cerrado**: DS-00…U-10 en código, sin favoritos ni Mercado Pago en el browser. No autoriza release, POS/BlackStore adapter, fiscal/ARCA, tenancy SaaS, DEMO-as-production ni deploy.

Siguiente carril: MP-LIVE-02 (ADR/contrato) y luego Sol GO para MP-LIVE-03. POS contrato y fiscal externo siguen documentales. No autoriza live vendor credentials en CI.

## WIP POS (paralelo, no es el baseline)

- `sdd/wip/20260921-storecore-pos-integration-contract-v1/` — contrato HTTP canónico. Documentary only; conector real bloqueado.
- `sdd/wip/20260921-pos-sales-ingestion/` — superseded.
- `sdd/wip/20260921-blackstore-pos-operations/` — puntero histórico.

## Fiscal externo

- `20260921-arca-fiscal-discovery` y `20260921-arca-storecore-adapter-contract`: `documented_deferred`. Sin código, DDL, worker ni secretos.

## Mercado Pago Checkout Pro (WIP separado)

- `sdd/wip/20260922-storecore-mp-live-checkout-v1/`: Checkout Pro externo en la misma ventana mediante Orders API, `documented_deferred`.
- MP-LIVE-02A cerrado in-repo: política Kotlin pura + tests en memoria. Sin wiring, DDL, red ni credenciales. MP-LIVE-03/04/05, pagos reales y fiscal siguen NO-GO. Ver `sdd/reviews/20260922-sol-mp-live-02a-go.md` y `sdd/reviews/20260922-sol-mp-live-02a-code-review.md`.
