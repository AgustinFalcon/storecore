# Metadata — continuidad de acceso para carrito y checkout

- Estado: `completed`
- Fecha: 2026-11-13
- Modo: brownfield, StoreCore frontend/backend y acceso unificado existente
- Prioridad: P2 funcional de experiencia comprador
- Autoridad: PR #265, merge `bfabff52bd1bd23ad4d5b9bba4510f1be0a6eec1`
- Validación: Verify PR `43514077477` y post-merge `43515110984`, 3/3 verdes

## Alcance

Preservar exclusivamente los destinos cerrados carrito y checkout al pasar por
login o registro. El servidor sigue siendo autoridad del destino, no se aceptan
URLs arbitrarias y el retorno nunca agrega líneas, crea pedidos ni procesa pagos.

La selección de producto/variante/cantidad requiere una continuación comercial
tipada y se entrega en un corte posterior; no se simula mediante query strings
libres en este cambio.
