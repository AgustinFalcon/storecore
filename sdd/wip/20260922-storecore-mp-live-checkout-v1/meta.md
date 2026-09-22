# Meta — Mercado Pago live checkout

- **Feature id:** `20260922-storecore-mp-live-checkout-v1`
- **Status:** `documented_deferred`
- **Maturity:** contrato aprobado; MP-LIVE-03/04 fail-closed APPROVED. No autoriza sandbox, credenciales, producción ni emisión fiscal.
- **Related:** `20260921-single-tenant-installation-baseline`, `20260921-arca-storecore-adapter-contract`.

## Objetivo

Definir el carril pendiente de integración real de Mercado Pago para una instalación StoreCore: elección de producto, checkout remoto, recepción de notificaciones, consulta server-side del recurso canónico y aplicación comercial verificable.

## Decisión de producto — 2026-09-22

El comprador saldrá de StoreCore hacia **Checkout Pro con redirección en la misma ventana**, integrado mediante **Orders API**. Checkout embebido/Checkout API y Preferences API quedan fuera de v1. La modalidad de pago no convierte el retorno del navegador en prueba de cobro. Ver [contrato y fuentes](2-technical/checkout-pro-orders-decision.md), [ADR propuesto](2-technical/adr-001-orders-lifecycle.md) y [modelo físico propuesto](2-technical/data-model-proposal.md).

## Gate

MP-LIVE-02 aprobado. MP-LIVE-03/04 fail-closed **APPROVED** (`sdd/reviews/20260922-sol-mp-live-03-code-rereview.md`). MP-LIVE-05 y la activación siguen NO-GO.

La revisión de código de MP-LIVE-02A permanece válida para la política pura. MP-LIVE-05 y la activación siguen NO-GO. Ver `sdd/reviews/20260922-sol-mp-live-03-go.md`.

## Sol review — 2026-09-22

GO documental del WIP y CONDITIONAL_GO de código para MP-LIVE-03/04. NO-GO de sandbox/live, POS, fiscal y credenciales en repo/CI. Ver `sdd/reviews/20260922-sol-mp-live-02-review.md` y `sdd/reviews/20260922-sol-mp-live-03-go.md`.
