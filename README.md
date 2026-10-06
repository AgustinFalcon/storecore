# StoreCore

StoreCore se orienta a `storecore-core-v1.0.0`: e-commerce de producción, single-tenant por VM/comercio, merchant-agnostic.

**Estado:** core `storecore-core-v1.0.0` implementado y archivado. Integración PR #14. No hay tag, deploy ni importación productiva autorizada.

## Lectura canónica

1. `sdd/STATUS.md` y `sdd/RELEASE.md` establecen precedencia y gate Sol.
2. `sdd/PROJECT.md`, `sdd/PATTERNS.md` y la matriz de capabilities explican producto y límites.
3. `sdd/features/20260921-single-tenant-installation-baseline/` contiene specs, ADRs, modelo y plan archivados.
4. Siguiente carril: `docs/agent/frontend/ux-handoff.md`.

Acceso vigente: `/login` es la única entrada visual. CUSTOMER y USER mantienen
identidades, cookies, CSRF, sesiones y permisos separados; el diseño y evidencia
están archivados en `sdd/features/20261003-unified-access-entry/`. Los endpoints
HTTP de credenciales por realm siguen soportados; BlackStore no está federado.

El core 1.0.0 incluye storefront productivo, catálogo/búsqueda, marca/categoría/ofertas, contenido configurable de home, carrito, checkout, customer/profile/address, órdenes, fulfillment manual básico, stock WEB y sincronización ML autorizada, más administración de catálogo/contenido/promos manuales.

`universal-tools-profile@1.0.0` es un perfil de configuración/fixtures importable y versionado, compatible con core 1.x. No es un fork, una release de código, un cliente especial ni una regla hardcodeada.

POS/venta física pertenece al repositorio **BlackStore** (`../BlackStore`, WIP `blackstore-pilot`). StoreCore publica el contrato HTTP `storecore-pos-integration-contract-v1` (`sdd/wip/20260921-storecore-pos-integration-contract-v1/`, `ready_for_sol_review`, no approved). No persiste tickets ni factura de mostrador. `pos-sales-ingestion` y `blackstore-pos-core` están superseded.
