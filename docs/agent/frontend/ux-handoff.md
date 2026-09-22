# Handoff UX → Angular

Cuando llegue un diseño, pegar ID + HTML. El agente lo vuelca en el `*.view.html` listado. CSS extra va a tokens en `frontend/src/styles.scss`, no a colores sueltos.

| ID | Archivo | Estado diseño |
|---|---|---|
| DS-00 | shell + tokens | En código (theme header + CTA azul + aire) |
| P-01 | `storefront-home.view.html` | En código (layout P-01, datos HTTP, sin ferretería) |
| P-02 | `catalog-page.view.html` | Pendiente |
| P-03 | `product-page.view.html` | Pendiente |
| C-01 | `customer-session.view.html` | Pendiente |
| C-02 | `customer-register.view.html` | Pendiente |
| C-03 | `customer-profile.view.html` | Pendiente |
| C-04 | `customer-addresses.view.html` | Pendiente |
| C-05 | `cart-page.view.html` | Pendiente |
| C-06 | `checkout-page.view.html` | Pendiente |
| C-07 | `checkout-result.view.html` | Pendiente |
| C-08 | `customer-orders.view.html` | Pendiente |
| C-09 | `customer-order-detail.view.html` | Pendiente |
| U-01 | `user-session.view.html` | Pendiente |
| U-02 | `user-content.view.html` | Pendiente |
| U-03 | `user-catalog.view.html` | Pendiente |
| U-04 | `user-promos.view.html` | Pendiente |
| U-05 | `fulfillment.view.html` | Pendiente |
| U-06 | `user-order-detail.view.html` | Pendiente |
| U-07 | `user-inventory.view.html` | Pendiente |
| U-08 | `user-mercadolibre.view.html` | Pendiente |
| U-09 | `user-capabilities.view.html` | Pendiente |
| U-10 | `profile-import.view.html` | Pendiente |

Orden de pedido a la IA de diseño: DS-00 → P-01…P-03 → C-01…C-09 → U-01…U-10.

Prompt canónico: `docs/agent/frontend/ux-design-prompt.md`.
