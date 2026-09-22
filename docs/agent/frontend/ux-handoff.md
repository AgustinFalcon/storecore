# Handoff UX → Angular

Cuando llegue un diseño, pegar ID + HTML. El agente lo vuelca en el `*.view.html` listado. CSS extra va a tokens en `frontend/src/styles.scss`, no a colores sueltos.

| ID | Archivo | Estado diseño |
|---|---|---|
| DS-00 | shell + tokens | En código (theme header + CTA azul + aire) |
| P-01 | `storefront-home.view.html` | En código |
| P-02 | `catalog-page.view.html` | En código |
| P-03 | `product-page.view.html` | En código |
| C-01 | `customer-session.view.html` | En código |
| C-02 | `customer-register.view.html` | En código |
| C-03 | `customer-profile.view.html` | En código |
| C-04 | `customer-addresses.view.html` | En código |
| C-05 | `cart-page.view.html` | En código |
| C-06 | `checkout-page.view.html` | En código |
| C-07 | `checkout-result.view.html` | En código |
| C-08 | `customer-orders.view.html` | En código |
| C-09 | `customer-order-detail.view.html` | En código |
| U-01 | `user-session.view.html` | En código |
| U-02 | `user-content.view.html` | En código |
| U-03 | `user-catalog.view.html` | En código |
| U-04 | `user-promos.view.html` | En código |
| U-05 | `fulfillment.view.html` | En código |
| U-06 | `user-order-detail.view.html` | En código |
| U-07 | `user-inventory.view.html` | En código |
| U-08 | `user-mercadolibre.view.html` | En código |
| U-09 | `user-capabilities.view.html` | En código |
| U-10 | `profile-import.view.html` | En código |

Plan cerrado 2026-09-22. Favoritos no van en chrome ni PDP (TODO-036). Stitch de P-02…U-10 no es bloqueante: las views usan tokens DS-00.

Prompt canónico: `docs/agent/frontend/ux-design-prompt.md`.
