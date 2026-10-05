# Inventario canónico de pantallas

Una pantalla = una ruta = un `*.view.html`. HTML **en repo** (views Angular actuales) vive en `4-implementation/artifacts/views-in-code/`. Stitch es referencia visual, no pixel-baseline.

Estados globales de **todas**: default / loading / vacío / error+Reintentar / disabled / éxito. Idioma: español rioplatense.

Nota de inventario runtime (issue #148): este WIP conserva 22 superficies UX. `app.routes.ts` contiene 24 leaf routes: agrega `/customer/favorites` (boceto browser-only, fuera del alcance/autorización de este WIP) y `/user/offers` (ruta operador existente). La cobertura de navegador de esas rutas se documenta por separado en `sdd/wip/20261002-all-routes-a11y/`; no promociona favoritos ni declara homologación visual completa.

## Design system (no son rutas)

| ID | Qué define | HTML en repo |
|---|---|---|
| DS-00 | Skip, header navy, banner API, subnavs, botones, campo, card, badge, tabla, product card, price stack, qty, empty, auth card | Stitch `6338ab05e52f48228b34f056f0decdd7` |
| DS-04 | Modales: confirm, destructivo, error API, merge incompatible | Stitch `4206f4cb6c4b40b69372406b2595e0a7` |
| DS-05 | Loading, error, vacío, disabled, éxito | Stitch `c70a51c84ed14d83974892391536b48d` |
| DS-06 | Escala Inter, money tabular, SKU mono, 5 capability states | Stitch `e7bad4afbee04e28a60eace1d2bec419` |

## Público

| ID | Ruta | HTML archivado | Anatomía |
|---|---|---|---|
| P-01 | `/` | `views-in-code/P-01-home.html` | **Lleno:** banner carousel HTTP + tira ofertas + chips categoría + bloques. **Vacío:** “Home configurable vacío.” Ver `product-decision-home-carousels.md` |
| P-02 | `/catalog` | `views-in-code/P-02-catalog.html` | Toolbar búsqueda/marca/categoría/sólo ofertas. Grilla cards. Precio = effective |
| P-03 | `/catalog/:sku` | `views-in-code/P-03-product.html` | Galería + price stack. Add con sesión customer; si no, “Entrar para agregar” |

## Customer

| ID | Ruta | Guard | HTML archivado | Anatomía |
|---|---|---|---|---|
| C-01 | `/customer/session` | no | `C-01-customer-session.html` | Auth card. Email + password. No Google |
| C-02 | `/customer/register` | no | `C-02-customer-register.html` | Nombre, email, password |
| C-03 | `/customer/profile` | sí | `C-03-customer-profile.html` | Nombre, email, teléfono. Banner éxito |
| C-04 | `/customer/addresses` | sí | `C-04-customer-addresses.html` | Lista + form etiqueta/línea/ciudad/CP |
| C-05 | `/cart` | sí | `C-05-cart.html` | Líneas con original/dto/oferta/campaña/**effective**. Qty stepper |
| C-06 | `/checkout` | sí | `C-06-checkout.html` | Entrega + moneda. Sin UI MP. Reintentar = misma clave |
| C-07 | `/checkout/result/:orderId` | sí | `C-07-checkout-result.html` | Orden ≠ pago. Sin confetti |
| C-08 | `/customer/orders` | sí | `C-08-customer-orders.html` | Sólo órdenes de ese customer |
| C-09 | `/customer/orders/:id` | sí | `C-09-customer-order-detail.html` | Snapshot líneas. Read-only |

## User

| ID | Ruta | Guard | HTML archivado | Anatomía |
|---|---|---|---|---|
| U-01 | `/user/session` | no | `U-01-user-session.html` | Login ops. Sin auto-alta |
| U-02 | `/user/content` | sí | `U-02-user-content.html` | Título + cuerpo → home HTTP |
| U-03 | `/user/catalog` | sí | `U-03-user-catalog.html` | Productos + marcas + categorías. Observed/effective RO |
| U-04 | `/user/promos` | sí | `U-04-user-promos.html` | MANUAL. Vigencia, prioridad, margen, aprobador |
| U-05 | `/user/orders` | sí | `U-05-fulfillment.html` | Sólo siguiente transición + RMA de a una |
| U-06 | `/user/orders/:id` | sí | `U-06-user-order-detail.html` | Igual, una orden |
| U-07 | `/user/inventory` | sí | `U-07-inventory.html` | available / reserved / safety. Sin write |
| U-08 | `/user/mercadolibre` | sí | `U-08-mercadolibre.html` | Cuenta + mapa listing→SKU. Sin secretos |
| U-09 | `/user/capabilities` | sí | `U-09-capabilities.html` | 5 botones de estado. No toggle |
| U-10 | `/user/profile-import` | sí | `U-10-profile-import.html` | Preview/merge. Merge disabled si incompatible |

## Fuera de este WIP

Venta física / POS companion, fiscal, favoritos, loyalty, carriers, calendario, automatización ML, kits, DEMO, tenancy.
