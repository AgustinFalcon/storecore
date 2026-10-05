# ADR — dos linajes Flyway inmutables

Conservar byte por byte V1–V9 de `master` y V1–V19 de `integration/storecore-int`. No usar `repair`, `baseline`, `outOfOrder`, edición de checksums ni sustitución de migraciones publicadas. Antes del SQL se captura versión, checksum, firmas, owners y grants sin secretos; un historial mezclado o desconocido aborta.

El corte master candidato es `V10__capability_admin_tx_c_cutover.sql`; el corte integración candidato es `V20__capability_legacy_overloads_retirement.sql`. Ambos revocan forward-only las seis firmas legacy, incluyendo overloads module-bound, y cierran PUBLIC, runtime y membresías heredadas. El caller Tx-C se despliega en el mismo corte.
