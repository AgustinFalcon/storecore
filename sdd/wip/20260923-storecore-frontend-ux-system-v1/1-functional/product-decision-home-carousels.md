# Decisión de producto — Home retail (carruseles)

**Fecha:** 2026-09-23  
**Estado:** propuesta de PO (usuario) + review UX/comprador. Pendiente Sol.

## Qué se conserva del mock viejo (amarillo)

El mock `docs/agent/frontend/stitch/p-01-home` tenía **ritmo de tienda** útil:

1. **Banner hero grande** que rota solo (más alto que un strip).
2. **Carrusel horizontal de ofertas** tipo faja ML (cards con foto + precio + peek de la siguiente).
3. Densidad retail: header de compra, grilla, tiras, no un tablero de sync.

## Qué se tira

Piel Mercado Libre / ferretería: header amarillo, cuotas inventadas, FULL, DeWalt/Bosch/Makita, Universal Tools, countdown, “últimas 2 unidades”, DEMO, `store_id`.

## Qué queda autorizado en P-01

| Pieza | Origen de datos | Regla |
|---|---|---|
| Banner carousel (~420–480px) | Bloques de `GET /api/v1/content/home` tipo campaign | Auto-rotate ~6s; pause on hover/focus; `prefers-reduced-motion` detiene; dots + prev/next; 0 slides = no se pinta la región |
| Carrusel ofertas | Catálogo `offers=true` o bloque home de ofertas | Cards: imagen, nombre, **solo effective**; original tachado sólo si hay dto; badge oferta; link `/catalog/:sku` |
| Chips de categoría | Facets HTTP | Solo si el API las devuelve |
| Bloques de confianza | Home HTTP | Copy del comercio; nada inventado (sin umbral de envío gratis ni 12 cuotas) |
| Vacío / error | Estados globales DS-05 | Vacío honesto o Reintentar; nunca endpoints en la vidriera |

Precio de venta en storefront = **effective**. Customer sin sesión no finge add-to-cart.

## Reviews 2026-09-23

| Rol | Veredicto del P-01 “sparse” (bloques CMS) |
|---|---|
| UX | `CHANGES_REQUIRED` — falta vidriera; conservar carruseles del mock viejo con tokens DS-00 |
| Product Owner | `CHANGES_REQUIRED` — el público no puede ver una consola de sync |
| Comprador | `NO-GO` — sin banner, sin productos, sin precio no hay tienda |

El P-01 sparse queda como **estado vacío / home sin bloques**. El P-01 retail (Stitch nuevo) es el **estado lleno**.
