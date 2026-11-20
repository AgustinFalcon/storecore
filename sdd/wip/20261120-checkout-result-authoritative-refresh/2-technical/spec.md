# Spec técnico

## Diseño

`PaymentStatus` conserva la regla `permitsAuthoritativeRefresh`; sólo `Pending`
la habilita. `Unknown` y todos los estados terminales fallan cerrados.

`CustomerOrderRefreshPhase` es un tipo cerrado TypeScript con constructor
privado, instancias estáticas y un único `fromWire`. Expone etiqueta, estado
ocupado y posibilidad de activación; componente y tests usan el tipo, nunca
strings mágicos.

`CustomerOrderReadMode` distingue carga inicial y actualización preservando el
snapshot. Ambas entradas publican un `CustomerOrderReadCommand` en un único
effect `switchMap`; por eso una nueva ruta o lectura cancela la anterior. La
carga inicial limpia la orden previa. La actualización conserva la orden,
marca `Refreshing` y termina en `Succeeded` o `Failed`.

La vista recibe `CustomerOrderRefreshPhase`, consulta la regla tipada de
`PaymentStatus` y emite una intención `refresh`. No conoce HTTP ni interpreta
el resultado del proveedor.

## Archivos previstos

- `frontend/src/app/domain/order/commerce-states.ts`
- `frontend/src/app/features/orders/customer-order-refresh.ts`
- `frontend/src/app/features/orders/customer-order-detail.store.ts`
- `frontend/src/app/features/cart/checkout-result.component.ts`
- `frontend/src/app/features/cart/checkout-result.view.ts`
- `frontend/src/app/features/cart/checkout-result.view.html`
- pruebas de dominio, store, cancelación y vista.

## Gates

- Tests focales de tipo cerrado/store/vista/cancelación.
- `npm run lint`.
- `npm run build`.
- `git diff --check`.
- CI alojado y dos reviews exact-head antes del merge.
