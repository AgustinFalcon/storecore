# Especificación técnica

- Introducir un modelo de comando `CatalogProductDraft`, separado de la proyección
  `ProductDetail`.
- Modelar `CatalogEditorMode` como clase cerrada con `Create`, `Edit`, `Unknown` y
  un único `fromWire`.
- Traducir `ProductDetail` a borrador en el borde del editor.
- Serializar `availableQuantity` únicamente cuando la variante no tiene identidad
  persistida. El backend conserva la regla `CATALOG_STOCK_REQUIRES_ADJUSTMENT_COMMAND`.
- Mantener `VariantStatus` y `ProductStatus` como autoridades de estado.
- Cubrir traducción, validación de borrador, serialización y experiencia de edición.

