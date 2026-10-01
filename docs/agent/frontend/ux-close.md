# Cierre plan frontend UX — 2026-09-22

Plan `docs/agent/frontend/ux-handoff.md` cerrado. Las 22 superficies (DS-00 + P-01…P-03 + C-01…C-09 + U-01…U-10) viven en views Angular con tokens `--sc-*`.

## Qué quedó

- Rutas y stores del core v1.0.0 sin cambio de contrato HTTP.
- Copy y anatomía alineadas al pacto: toolbar de catálogo, price stack del PDP, snapshot del carrito, checkout sin UI Mercado Pago, fulfillment sólo siguiente transición, inventario read-only, capabilities tipadas, import preview/merge.
- Favoritos sacados del chrome, tile y PDP (TODO-036, diferido).

## Residuales in-repo cerrados en este ship

- TASK-013: Playwright + axe en pantallas públicas (`npm run test:a11y`). Stitch sigue como referencia visual.
- TODO-041: worker refetch/apply con port oficial; CI fake / unconfigured deja `RECEIVED`.
- TODO-003: runbook de flota en `fleet-operations.md`.

## Qué no cierra esto

- Release, tag, deploy, adapter de venta física / POS companion, fiscal/ARCA, credenciales live de vendor.

## Evidencia

- Views: `frontend/src/app/features/**/*.view.html`
- Tokens: `frontend/src/styles.scss`
- Handoff: todas las filas en `En código`
