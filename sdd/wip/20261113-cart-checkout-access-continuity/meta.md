# Metadata — continuidad de acceso para carrito y checkout

- Estado: `SPEC_REVIEW`
- Fecha: 2026-11-13
- Modo: brownfield, StoreCore frontend/backend y acceso unificado existente
- Prioridad: P2 funcional de experiencia comprador
- Autoridad: rama `feat/purchase-access-continuity` desde `master@332cd52421323728907a80a2eebc8fad88ea275e`

## Alcance

Preservar exclusivamente los destinos cerrados carrito y checkout al pasar por
login o registro. El servidor sigue siendo autoridad del destino, no se aceptan
URLs arbitrarias y el retorno nunca agrega líneas, crea pedidos ni procesa pagos.

La selección de producto/variante/cantidad requiere una continuación comercial
tipada y se entrega en un corte posterior; no se simula mediante query strings
libres en este cambio.
