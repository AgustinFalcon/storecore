# Spec UI — carrito y checkout (TASK-006)

- Línea snapshot: SKU, nombre, qty, original, discount, offerRef, campaignRef, effective.
- `GET /api/v1/customer/cart`.
- `PUT /api/v1/customer/cart/items` `{ sku, quantity }` — qty 0 quita la línea.
- Checkout: `POST /api/v1/customer/checkout` `{ idempotencyKey, addressId, currency, paymentMethod }`. `paymentMethod` es `MERCADO_PAGO` o `CASH`. No cobra. El efectivo no sale de la ventana. Mercado Pago sólo redirige si hay una URL HTTPS allowlisted.
- Reintentar reusa la misma clave, entrega y moneda. El browser no carga la tarjeta.
- Órdenes: `GET /api/v1/customer/orders` — sólo las propias.
- Estados de orden y pago son independientes en el payload.

## AC

- AC-1: retry no rota la clave en el browser.
- AC-2: snapshot visible en carrito y órdenes.
- AC-3: guard customer; admin va por `/user/orders`.
