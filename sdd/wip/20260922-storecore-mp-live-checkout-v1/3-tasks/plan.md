# Plan — Mercado Pago live checkout

**Estado:** `documented_deferred`; GO documental de Sol y excepción de código **sólo MP-LIVE-02A**. MP-LIVE-03/04/05 siguen NO-GO.

| ID | Trabajo | Estado | Salida requerida |
| --- | --- | --- | --- |
| MP-LIVE-01 | Seleccionar Checkout Pro externo vía Orders API y conservar fuentes oficiales fechadas de checkout, notificación y recurso. | Done: decisión documental 2026-09-22 | `2-technical/checkout-pro-orders-decision.md`; no es GO de código. |
| MP-LIVE-02 | ADR: mapear firma, shape, `order`/`orders_v2`, query/body `data.id`, order, payment, refund y chargeback; dedupe, intento durable, creación ambigua, búsqueda por referencia, un solo intento activo, doble acreditación, merchant, aplicación, importes, moneda, reserva vencida y reversos. | In progress: ADR propuesto; discrepancias oficiales + reglas comerciales abiertas | `2-technical/adr-001-orders-lifecycle.md`; cerrar parámetros/errores, stock tardío y muestras; revisión Sol. |
| MP-LIVE-02A | Lógica pura Kotlin de intentos/recovery sin efectos; no habilita Checkout Pro. | Done aislado 2026-09-22: 10/10 tests focalizados y Sol GO de código; sin wiring | `3-tasks/mp-live-02a-pure-logic.md`, `sdd/reviews/20260922-sol-mp-live-02a-code-review.md`. |
| MP-LIVE-03 | Diseñar adapter server-side, asociación de `providerOrderId`, validación, inbox, GET order, aplicación idempotente y modelo físico/migración sin reutilizar event ID como resource ID. | In progress documental: modelo propuesto, sin GO de código | `2-technical/data-model-proposal.md`; esquema final/migración y pruebas revisadas tras MP-LIVE-02. |
| MP-LIVE-04 | Implementar con doubles y pruebas de recuperación/transiciones. | Blocked: MP-LIVE-03 + Sol GO | Evidencia de pruebas. |
| MP-LIVE-05 | Configurar sandbox/pruebas MP y ejecutar end-to-end antes de activar pagos. | Blocked: cuenta/credenciales MP + Sol GO + MP-LIVE-04 | Credenciales fuera del repo, muestra de webhook y evidencia saneada. |

La única excepción de código ejecutada es MP-LIVE-02A: dominio Kotlin puro y tests en memoria, sin wiring ni efectos externos. La suite completa del backend corrió con 80 tests y quedó roja por 3 fallos + 1 error en pricing/identidad ajenos a esta política; no se declara verde global. No se abre DDL, red, adapter live ni credenciales desde este plan. El producto y las fuentes quedaron decididos; contrato implementable, modelo físico y Sol GO aún bloquean MP-LIVE-03/04/05. Las credenciales no bloquean código con doubles luego de un GO específico; sí MP-LIVE-05. La integración fiscal sólo puede consumir el evento comercial resultante una vez que este carril tenga evidencia y los gates fiscales correspondientes estén cerrados.
