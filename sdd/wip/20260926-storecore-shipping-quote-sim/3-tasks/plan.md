# Plan — simulación de envío

| ID | Trabajo | Hecho cuando |
|---|---|---|
| SHIP-01 | `quoteShipping` y el recorrido (retiro vs despacho) sin Angular | Specs de precio, orden de estados y fecha en verde |
| SHIP-02 | `/checkout/shipping`: opciones, total y la lista completa de estados | `customerGuard`, container → view → store → use case → HTTP |
| SHIP-03 | `/customer/orders/:id/envio`: estado actual y «Simular siguiente estado» | El último paso no avanza; no toca la orden ni inventa tracking |
| SHIP-04 | Checkout y el detalle de orden enlazan estas pantallas | El fulfillment de operador no cambia. El medio de pago es un contrato de UI: el cliente envía `paymentMethod` y no cobra |
| SHIP-05 | Stitch desktop `357740581d144589aa56d3b5a189f12b` y mobile `a83f6d46166e43d1a8fa3d91572de9d9` | Proyecto `6473866243657965808`, design system StoreCore |
| SHIP-06 | Capturas 390×844 y 1440×900 de estas dos pantallas junto con las 24 | Sin scroll horizontal de página |
| SHIP-07 | Mapa para marcar lat/lng, persistirlas y validar cobertura | Sin clave de Google; retiro con punto, estándar 25 km, expreso 10 km |

Sin Kotlin, sin Flyway, sin carrier, sin merge a `master`.

SHIP-01 a SHIP-07 están implementados en el frontend de `integration/storefront-mock`. La suite de arquitectura, lint, tests, build, accesibilidad y capturas 390×844 / 1440×900 quedó en verde.
