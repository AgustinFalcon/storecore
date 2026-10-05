# Meta — convergencia forward-only de capability admin

- **Feature id:** `20261005-capability-admin-lineage-convergence`
- **Estado:** `planned_blocked_until_inventory`
- **Base de diseño:** `master` `fcb431144278ab6cb4836df2e348710f88fa4dae` y `integration/storecore-int` `0737130eb4e58f6abba9353c42ab3d35db33a297`.
- **Motivo:** los historiales Flyway divergen en V8/V9. No se modifican, reemplazan, reparan ni se alteran checksums publicados.
- **Stack:** Kotlin/Spring Boot, PostgreSQL 16, Flyway.
- **No alcance:** BlackStore, login unificado, POS/DSP nuevos, fiscal/ARCA, Mercado Pago live, carrier real, activaciones o secretos.

Este WIP no autoriza la promoción masiva del PR #162. Sólo habilita un corte core revisable después del inventario de `flyway_schema_history` y de las ACL efectivas en cada instalación.
