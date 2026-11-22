# Validación local del corte de presentación

Fecha: 2026-11-22

## Resultado

- `npm run showcase:test`: PASS inicial 116/116; después de resolver los hallazgos de revisión, PASS final 117/117.
- `npm run build`: PASS. El bundle inicial queda en 710,77 kB; conserva un warning no bloqueante frente al presupuesto histórico de 700 kB y permanece por debajo del error de 900 kB.
- PostgreSQL 16 real mediante Testcontainers: PASS para `CatalogImageReferenceTest`, `MediaCommandPostgresTest`, `MediaProductCreationPostgresTest`, `CapabilitySessionAdministrationMigrationTest` e `IdentityDeliveryQueuePostgresTest`.
- La primera ejecución detectó una expectativa obsoleta del test de upgrade V29: el esquema vigente termina en V32, no V30. Se corrigió el nombre y la expectativa para verificar V29 -> esquema actual, conservando los checksums publicados. La clase corregida volvió a pasar contra PostgreSQL 16.
- La primera revisión independiente encontró tres P2: diferencia de mayúsculas entre el dominio y el `CHECK` de imágenes, tipos finitos construibles desde fuera y repetición de un POST de políticas tras perder el journal. Se cerraron alineando la validación, protegiendo constructores mediante tokens privados y reconciliando una política exacta antes de crearla. Las pruebas focales quedaron 8/8 y la suite final 117/117.

## Límites

Este gate acredita el dataset sintético, el build, las migraciones V1 -> V32 y las rutas de persistencia modificadas. No acredita credenciales ni homologaciones productivas de Mercado Pago, Mercado Libre, ARCA, Correo Argentino o SMTP.
