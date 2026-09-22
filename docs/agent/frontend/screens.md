# Inventario de pantallas — StoreCore core

Pedido para UX/UI. Una pantalla = una ruta = un `*.view.html`.
La estructura Angular ya está: container → view → store → use case → HTTP.
UX reemplaza el HTML de la view; no toca stores ni dominio.
Prompt para la IA de diseño (todas las pantallas): `docs/agent/frontend/ux-design-prompt.md`.
Handoff: `docs/agent/frontend/ux-handoff.md`.
Identidades: **customer** (compra) y **user** (operador). No se mezclan.

## Público

| ID | Ruta | HTML | Qué pide UX |
|---|---|---|---|
| P-01 | `/` | `storefront-home.view.html` | Home configurable (bloques). Vacío si no hay contenido. |
| P-02 | `/catalog` | `catalog-page.view.html` | Búsqueda, marca, categoría, sólo ofertas, listado. |
| P-03 | `/catalog/:sku` | `product-page.view.html` | Detalle: imágenes, variantes, precio **effective**, agregar al carrito. |

## Customer

| ID | Ruta | Guard | HTML | Qué pide UX |
|---|---|---|---|---|
| C-01 | `/customer/session` | no | `customer-session.view.html` | Login. |
| C-02 | `/customer/register` | no | `customer-register.view.html` | Alta de cuenta (nombre, email, password). |
| C-03 | `/customer/profile` | sí | `customer-profile.view.html` | Editar nombre/email/teléfono. |
| C-04 | `/customer/addresses` | sí | `customer-addresses.view.html` | Listar, alta y edición de entrega. |
| C-05 | `/cart` | sí | `cart-page.view.html` | Snapshot: original, dto, oferta, campaña, effective, qty. |
| C-06 | `/checkout` | sí | `checkout-page.view.html` | Elegir entrega + moneda. Pagar / Reintentar misma clave. No Mercado Pago en el browser. |
| C-07 | `/checkout/result/:orderId` | sí | `checkout-result.view.html` | Confirmación: orden vs pago independientes. |
| C-08 | `/customer/orders` | sí | `customer-orders.view.html` | Listado sólo de ese customer. |
| C-09 | `/customer/orders/:id` | sí | `customer-order-detail.view.html` | Detalle de una orden propia + líneas snapshot. |

## User

| ID | Ruta | Guard | HTML | Qué pide UX |
|---|---|---|---|---|
| U-01 | `/user/session` | no | `user-session.view.html` | Login operador. |
| U-02 | `/user/content` | sí | `user-content.view.html` | Editar home. |
| U-03 | `/user/catalog` | sí | `user-catalog.view.html` | Productos (SKU, imágenes, variantes, precios separados) + marcas + categorías. |
| U-04 | `/user/promos` | sí | `user-promos.view.html` | Promos MANUAL: vigencia, prioridad, margen, aprobador. |
| U-05 | `/user/orders` | sí | `fulfillment.view.html` | Cola de fulfillment. |
| U-06 | `/user/orders/:id` | sí | `user-order-detail.view.html` | Una orden: siguiente envío, tracking, RMA. |
| U-07 | `/user/inventory` | sí | `user-inventory.view.html` | Disponibilidad WEB (available, reserved, safety). Solo lectura. |
| U-08 | `/user/mercadolibre` | sí | `user-mercadolibre.view.html` | Cuenta autorizada + mapa listing/variation → SKU. Sin secretos. |
| U-09 | `/user/capabilities` | sí | `user-capabilities.view.html` | Estados `DISABLED\|READ_ONLY\|ACTIVE\|PAUSED\|ERROR`. |
| U-10 | `/user/profile-import` | sí | `profile-import.view.html` | Preview/merge de perfil. Diff sin secretos. |

## Chrome compartido (no es pantalla)

Shell: skip-link, nav Storefront / Catálogo / Carrito / Customer / User, estado de API, sesión customer vs user. Sin favoritos.

## No pedir a UX ahora

BlackStore/POS, fiscal/ARCA, favorites, loyalty, carriers reales, calendario comercial, automatización ML de precios, kits virtuales, fixtures DEMO.
