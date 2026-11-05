# G1 — reproducciones preservadas

Fecha: 2026-10-15. Estado: PASS unitario; evidencia E2E preservada para la ejecución de TASK-019.

La suite base se ejecutó antes de corregir políticas: 75 archivos / 312 tests PASS. Tras incorporar los guards de fulfillment y la cancelación coherente: 75 archivos / 314 tests PASS. El checkpoint integrado de SC24/SC26, persistencia transaccional del catálogo y exclusión por pedido pasa 81 archivos / 358 tests. El checkpoint SC17/SC25/404 pasa 88 archivos / 396 tests. El checkpoint SC04..09/SC18..19 pasa 94 archivos / 427 tests, lint, arquitectura y ambos builds.

## Matriz de los ocho bloqueos

1. Persistencia transaccional
   - `demo-state.spec.ts`: rollback de comando fallido, rechazo de snapshot stale e invalidación por reset/reemplazo.
   - Reproduce que un fallo no puede exponer cambios parciales ni éxito.
2. Pago y fulfillment
   - `demo-process-types.spec.ts`: pago pendiente/cancelación idempotente sin venta ni movimiento.
   - `fulfillment-transition.spec.ts`: Cancelled, RMA no accionable, Unknown y `PAID_STOCK_REVIEW` bloquean.
   - `cta-matrix.spec.ts`: expectativa heredada corregida de `Cancelado · Preparando` a `Cancelado · Cancelado`.
3. Cronología
   - `demo-model.spec.ts`: request repetido devuelve la misma orden y envío exige pago aprobado.
   - `demo-process-types.spec.ts`: snapshot conserva modalidad, destino y costo; eventos posteriores no reescriben el hecho histórico.
4. Alertas
   - `demo-process-types.spec.ts`: incidencia persiste, se resuelve sin borrar historial y el evento queda en la cronología.
   - `commercial-demo.spec.ts`: cambio de fulfillment y alerta competitiva tienen resultado visible.
5. Dashboard
   - `cta-matrix.spec.ts`: filtros de pagos, stock y productos coinciden con sus listas destino y estados vacíos.
6. Comprador/actor
   - `demo-state.spec.ts`: clientes aislados, reset sólo de claves Demo y contexto cerrado.
   - `cta-matrix.spec.ts`: contexto prohibido y aislamiento de actor.
7. Inventario
   - `demo-model.spec.ts`: variantes independientes, reserva/liberación, ajuste explícito por variante, devolución/inspección/reintegro/reembolso separados.
   - `commercial-demo.spec.ts`: compra y venta ML deduplicada se reflejan en stock.
8. Media y snapshot comercial
   - `demo-model.spec.ts`: orden confirmada congela producto, variante, media y precio; producto simple exige imagen accesible.
   - `review-regressions.spec.ts`: entradas inválidas conservan línea y persistencia.

## Correcciones preservadas en este corte

- `ShipmentStatus.Cancelled` no expone transición.
- `RmaStatus.Requested`, `Approved` y `Rejected` no exponen comandos Real no soportados.
- `FulfillmentActionPolicy` concentra autorización de acciones y bloquea Unknown/`PAID_STOCK_REVIEW` antes de la vista.
- Cancelar un pago pendiente también lleva shipment a `Cancelled`, limpia tracking y mantiene la operación idempotente.

## Comando y resultado

`npm test` — PASS más reciente: 75 archivos, 316 tests.

La ejecución Playwright integral queda en TASK-019 porque el gate visual de Stitch sigue abierto; los casos y expectativas no se borraron ni se reemplazaron por evidencia manual.
