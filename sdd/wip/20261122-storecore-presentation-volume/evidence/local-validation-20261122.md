# Validación local del corte de presentación

Fecha: 2026-11-22

## Resultado

- `npm run showcase:test`: PASS inicial 116/116; después de resolver los hallazgos de revisión y el caso de paginación, PASS final 118/118.
- `npm run build`: PASS. El bundle inicial queda en 710,77 kB; conserva un warning no bloqueante frente al presupuesto histórico de 700 kB y permanece por debajo del error de 900 kB.
- PostgreSQL 16 real mediante Testcontainers: PASS para `CatalogImageReferenceTest`, `MediaCommandPostgresTest`, `MediaProductCreationPostgresTest`, `CapabilitySessionAdministrationMigrationTest` e `IdentityDeliveryQueuePostgresTest`.
- La primera ejecución detectó una expectativa obsoleta del test de upgrade V29: el esquema vigente termina en V32, no V30. Se corrigió el nombre y la expectativa para verificar V29 -> esquema actual, conservando los checksums publicados. La clase corregida volvió a pasar contra PostgreSQL 16.
- La primera revisión independiente encontró tres P2: diferencia de mayúsculas entre el dominio y el `CHECK` de imágenes, tipos finitos construibles desde fuera y repetición de un POST de políticas tras perder el journal. Se cerraron alineando la validación, protegiendo constructores mediante tokens privados y reconciliando una política exacta antes de crearla.
- La segunda revisión detectó que la verificación por identificador sólo buscaba en las 50 políticas más recientes. La búsqueda ahora pagina con el mismo límite defensivo que la reconciliación y una prueba reproduce una política válida en la segunda página. Las pruebas focales quedaron 9/9 y la suite final 118/118.
- El primer CI del PR detectó contratos de prueba obsoletos, no defectos de dominio: nueve fixtures todavía esperaban el esquema V30 aunque el baseline vigente es V32; el flujo unificado esperaba el texto anterior `Salir`; y la matriz pública mezclaba filtros reactivos con la búsqueda textual explícita en una única espera de red.
- Se actualizaron únicamente esos contratos. La batería focal de migraciones e integración ejecutó 43 tests contra PostgreSQL sin fallos ni errores.
- `npm run check:psd-real`: PASS; valida estados cerrados, redacción de evidencia, TypeScript/ESLint y lista 126 recorridos Playwright.
- `npm run check:ua-real`: PASS; valida journal del proveedor, TypeScript y lista 29 recorridos de acceso unificado, comercio, stock y fulfillment.
- `npm run build`: PASS después de la corrección, con el mismo warning no bloqueante de 710,77 kB.

## Límites

Este gate acredita el dataset sintético, el build, las migraciones V1 -> V32 y las rutas de persistencia modificadas. No acredita credenciales ni homologaciones productivas de Mercado Pago, Mercado Libre, ARCA, Correo Argentino o SMTP.
