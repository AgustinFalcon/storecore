# Validación local del corte de presentación

Fecha: 2026-11-22

## Resultado

- `npm run showcase:test`: PASS, 116/116 pruebas.
- `npm run build`: PASS. El bundle inicial queda en 710,77 kB; conserva un warning no bloqueante frente al presupuesto histórico de 700 kB y permanece por debajo del error de 900 kB.
- PostgreSQL 16 real mediante Testcontainers: PASS para `CatalogImageReferenceTest`, `MediaCommandPostgresTest`, `MediaProductCreationPostgresTest`, `CapabilitySessionAdministrationMigrationTest` e `IdentityDeliveryQueuePostgresTest`.
- La primera ejecución detectó una expectativa obsoleta del test de upgrade V29: el esquema vigente termina en V32, no V30. Se corrigió el nombre y la expectativa para verificar V29 -> esquema actual, conservando los checksums publicados. La clase corregida volvió a pasar contra PostgreSQL 16.

## Límites

Este gate acredita el dataset sintético, el build, las migraciones V1 -> V32 y las rutas de persistencia modificadas. No acredita credenciales ni homologaciones productivas de Mercado Pago, Mercado Libre, ARCA, Correo Argentino o SMTP.
