# Progreso

## Corrección P1 — nueva intención de compra

Se implementó la apertura de intento desde una mutación exitosa de carrito, o un
cambio válido de dirección desde `Retryable`, `ProductUnavailable`/`Succeeded`.
Estas acciones vuelven a `Idle`, limpian error/receipt y rotan la clave; una
lectura GET o una mutación fallida conservan el intento. `Pending` bloquea
mutaciones del carrito y de dirección, con selector deshabilitado. Se agregaron
tests de corrección de producto, compra posterior, cambio de dirección, bloqueo
durante pago, ausencia de reset por GET y respuesta obsoleta. Una primera review
de código encontró este P1; la segunda review coordinada dominio/concurrencia y
seguridad/UX dio APPROVE sin P0–P3.

## Baseline

- Checkout sólo muestra selector vacío y pago deshabilitado.
- No existe un retorno tipado desde direcciones.
- `loadAddresses` escribe `errorMessage/failureKind` compartidos.
- Un `cartLoadedState` posterior puede borrar el fallo de direcciones.

## Estado

Primera revisión coordinada GPT-6.1 Sol: NO-GO conceptual, sin P0. Se incorporaron
los P1/P2 sobre retry separado, fencing de actor, vacío confirmado, disponibilidad
fail-closed, errores simultáneos y mutaciones/lecturas obsoletas. Re-review
v2 detectó un P2 residual: GET carrito aún podía borrar o apagar un intento de
pago. Se separó `CheckoutAttemptState` y su error/loading como autoridad propia.
Re-review v3 dio GO conceptual. Implementación completada con tipos cerrados,
canales independientes, fence por actor y retorno cerrado/reactivo.

## Evidencia local

- Suite focal Angular: 13 archivos, 95 tests, PASS.
- `npm run verify`: arquitectura y lint PASS; 194 archivos, 1303 tests, PASS;
  build productivo PASS.
- Playwright: `empty checkout resolves an address and returns with a confirmed
  selection`, PASS, incluyendo axe y foco de teclado.
- `git diff --check`: PASS.
- Doble review final GPT-6.1 Sol: APPROVE, sin findings P0–P3.

## Evidencia alojada

- PR: `#261`.
- Commit funcional: `f4b63cb`.
- GitHub Actions pre-merge: run `43495650447`.
- Jobs `backend`, `frontend` y `unified-access-real-e2e`: PASS.

## Cierre

- PR `#261` fusionado a `master` en `ae36a99e24152fbd38e93185d8254041a151b390`.
- GitHub Actions post-merge: run `43497831638`.
- Jobs `backend`, `frontend` y `unified-access-real-e2e`: PASS.
- Sin tareas funcionales, técnicas, de review o de validación pendientes en este
  corte.
