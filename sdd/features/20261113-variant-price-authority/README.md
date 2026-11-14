# Autoridad de precio por variante

StoreCore resuelve el precio comercial desde el SKU exacto. Cada variante usa
una política cerrada: hereda la base del producto o declara un override propio.
El mismo resolver alimenta catálogo, PDP, favoritos, carrito y snapshots de
orden/pago; las ofertas se aplican después sobre la base resuelta.

El administrador separa base padre de comandos `Preserve`, `Inherit` y
`Override`. El frontend presenta `Exact`, `Desde` o `Unknown` sin inventar cero,
conserva el lexema monetario durante la edición y bloquea compra/persistencia si
la cotización no es válida.

Entrega: PR #269, merge `7053e8f`. Verify del PR `43534342235` y post-merge
`43535120746`, ambos con backend, frontend y E2E real verdes.
