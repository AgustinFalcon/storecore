# Metadata — autoridad de precio por variante

- Estado: `implementation`
- Fecha: 2026-11-13
- Modo: brownfield, StoreCore backend y frontend productivos
- Prioridad: P1 de consistencia comercial antes de ampliar catálogo
- Base: `master@c0595e54b175009758b8940024115c024dd21215`

## Alcance

Hacer que cada SKU tenga un precio base autoritativo: heredado del producto o
sobrescrito explícitamente en su variante. La misma política resuelve catálogo,
PDP y carrito; las ofertas activas se aplican después sobre esa base resuelta.

El pedido conserva su snapshot histórico. No se modifica Mercado Libre,
BlackStore/POS, facturación ni el precio de una orden ya creada.
