# Plan — Mercado Pago live checkout

**Estado:** `documented_deferred` para activación; MP-LIVE-03/04 implementados bajo CONDITIONAL_GO. MP-LIVE-05 sigue NO-GO.

| ID | Trabajo | Estado | Salida requerida |
| --- | --- | --- | --- |
| MP-LIVE-01 | Seleccionar Checkout Pro externo vía Orders API y conservar fuentes oficiales fechadas de checkout, notificación y recurso. | Done: decisión documental 2026-09-22 | `2-technical/checkout-pro-orders-decision.md`; no es GO de código. |
| MP-LIVE-02 | ADR: firma oficial, IDs, errores, búsqueda, un intento activo, reversos y stock tardío. | Approved 2026-09-22 (`sdd/reviews/20260922-sol-mp-live-02-review.md`). | `adr-001-orders-lifecycle.md`, `error-and-recovery-matrix.md`, `webhook-identity-policy.md`, `reversal-and-stock-policy.md`. |
| MP-LIVE-02A | Lógica pura Kotlin de intentos/recovery sin efectos; no habilita Checkout Pro. | Done aislado 2026-09-22: 10/10 tests focalizados y Sol GO de código; sin wiring | `3-tasks/mp-live-02a-pure-logic.md`, `sdd/reviews/20260922-sol-mp-live-02a-code-review.md`. |
| MP-LIVE-03 | Diseñar adapter server-side, asociación de `providerOrderId`, validación, inbox, GET order, aplicación idempotente y modelo físico/migración sin reutilizar event ID como resource ID. | Done 2026-09-22 bajo CONDITIONAL_GO + fixes Sol: checkout productivo, bind refetch, locks. OFF por defecto. | `V4__mp_orders_checkout.sql`; `infrastructure/mporders/`. |
| MP-LIVE-04 | Implementar con doubles y pruebas de recuperación/transiciones. | Done 2026-09-22: URL, mismatch, dos remotes concurrentes y wrapper oficial, sin red ni credenciales. | `MpOrdersCheckoutIntegrationTest`, `OfficialWebhookSignatureAdapterTest`. |
| MP-LIVE-05 | Configurar sandbox/pruebas MP y ejecutar end-to-end antes de activar pagos. | Blocked: cuenta/credenciales MP + Sol GO de código + muestra `order`/`orders_v2`. | Credenciales fuera del repo, muestra de webhook y evidencia saneada. |

MP-LIVE-03/04 no activan pagos. El adapter oficial envuelve `WebhookSignatureValidator`; el default es `unconfigured`. La ruta V1 sin firma responde 410 y el worker V1 ya no aplica pagos. MP-LIVE-05 y fiscal siguen NO-GO.
