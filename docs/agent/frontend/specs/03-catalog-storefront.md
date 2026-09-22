# Spec UI — catálogo (TASK-005)

- Home configurable: `GET /api/v1/content/home`.
- Búsqueda y filtros: `GET /api/v1/catalog?query&brand&category&offers`.
- Detalle: `GET /api/v1/catalog/products/{sku}` con variantes, `availableQuantity`, `priceVersion`.
- Precio mostrado = effective. Base/desired/observed no se mezclan.
- Admin contenido: `GET/PUT /api/v1/user/content/home` en `/user/content`.
- Admin catálogo: `GET /api/v1/user/catalog`, `PUT /api/v1/user/catalog/products/{sku}` (imágenes y variantes).
- Admin marcas/categorías: `PUT /api/v1/user/catalog/brands/{id}`, `PUT /api/v1/user/catalog/categories/{id}`.
- Sin InMemoryCatalogRepository en producción.

## AC

- AC-1: search, brand/category, ofertas y detalle.
- AC-2: user cambia catálogo y home. Customer no.
