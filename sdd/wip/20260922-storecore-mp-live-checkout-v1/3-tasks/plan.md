# Plan — Mercado Pago live checkout

**Estado:** `documented_deferred`; GO documental de Sol y excepción de código **sólo MP-LIVE-02A**. MP-LIVE-03/04/05 siguen NO-GO.

| ID | Trabajo | Estado | Salida requerida |
| --- | --- | --- | --- |
| MP-LIVE-01 | Seleccionar Checkout Pro externo vía Orders API y conservar fuentes oficiales fechadas de checkout, notificación y recurso. | Done: decisión documental 2026-09-22 | `2-technical/checkout-pro-orders-decision.md`; no es GO de código. |
| MP-LIVE-02 | ADR: firma oficial, IDs, errores, búsqueda, un intento activo, reversos y stock tardío. | `ready_for_sol_review` 2026-09-22: anexos de matriz, webhook y reversos. Falta Sol + muestra sandbox `order`/`orders_v2`. | `adr-001-orders-lifecycle.md`, `error-and-recovery-matrix.md`, `webhook-identity-policy.md`, `reversal-and-stock-policy.md`. |
| MP-LIVE-02A | Lógica pura Kotlin de intentos/recovery sin efectos; no habilita Checkout Pro. | Done aislado 2026-09-22: 10/10 tests focalizados y Sol GO de código; sin wiring | `3-tasks/mp-live-02a-pure-logic.md`, `sdd/reviews/20260922-sol-mp-live-02a-code-review.md`. |
| MP-LIVE-03 | Diseñar adapter server-side, asociación de `providerOrderId`, validación, inbox, GET order, aplicación idempotente y modelo físico/migración sin reutilizar event ID como resource ID. | In progress documental: modelo propuesto, sin GO de código | `2-technical/data-model-proposal.md`; esquema final/migración y pruebas revisadas tras MP-LIVE-02. |
| MP-LIVE-04 | Implementar con doubles y pruebas de recuperación/transiciones. | Blocked: MP-LIVE-03 + Sol GO | Evidencia de pruebas. |
| MP-LIVE-05 | Configurar sandbox/pruebas MP y ejecutar end-to-end antes de activar pagos. | Blocked: cuenta/credenciales MP + Sol GO + MP-LIVE-04 | Credenciales fuera del repo, muestra de webhook y evidencia saneada. |

La única excepción de código es MP-LIVE-02A. MP-LIVE-02 quedó propuesto y listo para Sol; no se abre DDL, red, adapter live ni credenciales. MP-LIVE-03/04/05 siguen NO-GO. Fiscal consume sólo un evento verificado cuando existan sus gates.
