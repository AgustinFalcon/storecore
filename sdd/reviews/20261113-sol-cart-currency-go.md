# Sol gate — autoridad de moneda carrito/checkout

Fecha: 2026-11-13

## Dictamen

**GO documental y de código**, sin P0–P3 pendientes, para el WIP
`20261113-cart-checkout-currency-authority`.

Dominio/checkout y UX/seguridad revisaron y contrastaron el contrato. El P2
documental quedó resuelto: `UNSUPPORTED_CURRENCY` revoca ARS a `Unknown`, bloquea
submit/retry, conserva la idempotency key y exige un GET ARS fresco.

Durante la revisión del código surgieron dos P2 de concurrencia. Primero, una
respuesta iniciada antes del rechazo podía restaurar ARS; se cerró mediante una
generación de requests. Después, un error de recuperación podía ocultar la
revocación y permitir la restauración desde `addLine`; se cerró mediante un latch
independiente que sólo levanta un GET ARS fresco vigente.

Ambos revisores contrastaron la solución final y emitieron GO sin P0–P3.

## Alcance autorizado

- Reutilizar `PaymentCurrency` desde request hasta carrito/persistencia backend.
- Crear `CartCurrency` cerrado en frontend y traducir el wire una sola vez.
- Eliminar input y fallback ARS; presentar autoridad fija o indisponibilidad.
- Tipar error, replay, repository/store y agregar las pruebas especificadas.

## Límites

Sin multimoneda, DDL, proveedor live, credenciales, homologación, fiscal o
producción.

## Evidencia de gate

- Backend: 407/407 tests verdes; 0 fallos, errores u omitidos.
- Frontend: arquitectura 9/9, lint y build verdes; 1229/1229 tests verdes.
- Doble revisión GPT-6.1 Sol: GO coincidente sin P0–P3.
- `git diff --check`: limpio.

El merge requiere todavía CI remoto verde y verificación post-merge de `master`.
