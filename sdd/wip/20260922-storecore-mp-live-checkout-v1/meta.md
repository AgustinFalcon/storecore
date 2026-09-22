# Meta — Mercado Pago live checkout

- **Feature id:** `20260922-storecore-mp-live-checkout-v1`
- **Status:** `documented_deferred`
- **Maturity:** contrato documental con **única excepción de código MP-LIVE-02A cerrada** para política Kotlin pura/tests en memoria según Sol GO; no autoriza DDL, red, secrets, credenciales, sandbox, producción ni emisión fiscal.
- **Related:** `20260921-single-tenant-installation-baseline`, `20260921-arca-storecore-adapter-contract`.

## Objetivo

Definir el carril pendiente de integración real de Mercado Pago para una instalación StoreCore: elección de producto, checkout remoto, recepción de notificaciones, consulta server-side del recurso canónico y aplicación comercial verificable.

## Decisión de producto — 2026-09-22

El comprador saldrá de StoreCore hacia **Checkout Pro con redirección en la misma ventana**, integrado mediante **Orders API**. Checkout embebido/Checkout API y Preferences API quedan fuera de v1. La modalidad de pago no convierte el retorno del navegador en prueba de cobro. Ver [contrato y fuentes](2-technical/checkout-pro-orders-decision.md), [ADR propuesto](2-technical/adr-001-orders-lifecycle.md) y [modelo físico propuesto](2-technical/data-model-proposal.md).

## Gate

La selección de producto está cerrada. Permanecen abiertos el mapeo verificable del webhook, la política comercial de reversos, el modelo físico/ADR y un GO específico de Sol para la integración. Las credenciales no bloquean código con doubles después de ese GO; sí bloquean sandbox/E2E. **Sólo MP-LIVE-02A** tiene GO de código aislado; no se conecta al checkout ni habilita pagos.

MP-LIVE-02A fue implementado y revisado con 10/10 tests focalizados; la suite general de 80 tests sigue roja por 3 fallos + 1 error de pricing/identidad no relacionados. Ver `sdd/reviews/20260922-sol-mp-live-02a-code-review.md`. El GO aislado no amplía el gate de integración.

## Sol review — 2026-09-22

GO documental para este WIP de descubrimiento y para la decisión Checkout Pro/Orders API; NO-GO para MP-LIVE-03/04/05 o activar pagos reales. La revisión confirmó la separación de retorno/browser, validación antes de inbox, IDs de notificación/recurso, atomicidad y tratamiento pendiente de reversiones. El contrato de integración aún requiere ADR/modelo final y GO específico. La revisión posterior concedió GO **sólo** a MP-LIVE-02A. Ver `sdd/reviews/20260922-sol-mp-live-doc-review.md`, `sdd/reviews/20260922-sol-mp-orders-review.md` y `sdd/reviews/20260922-sol-mp-live-02a-go.md`.
