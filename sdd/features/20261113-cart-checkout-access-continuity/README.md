# Continuidad de acceso para carrito y checkout

Este slice preserva los destinos cerrados `CART` y `CHECKOUT` cuando un comprador
debe autenticarse o registrarse. No acepta URLs arbitrarias y la navegación sólo
continúa después de verificar autoridad CUSTOMER y CSRF en el servidor.

El registro se modeló como pasos con responsabilidad única y estados cerrados.
Una ausencia CUSTOMER confirmada habilita el alta; errores, timeouts y probes
supersedidos quedan fail-closed. La inspección tampoco puede rehabilitar una
sesión mientras su logout está pendiente.

La migración V20 amplía el conjunto persistible de destinos. La selección
parametrizada de producto, variante y cantidad permanece fuera de alcance y se
entregará en un SDD posterior.

Entrega: PR #265, merge `bfabff5`. Verify del PR `43514077477` y post-merge
`43515110984`, ambos con backend, frontend y E2E real verdes.
