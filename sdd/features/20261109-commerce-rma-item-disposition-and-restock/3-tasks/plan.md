# Plan incremental

1. Inventariar contratos, writers y locks; fijar evidencia roja para el gap.
2. Introducir tipos/políticas cerradas y tests puros.
3. Agregar migración forward con clean/upgrade e históricos sin backfill inventado.
4. Implementar comando atómico e idempotente con order-first locks y rollback total.
5. Exponer read model/POST/recuperación con autoridad existente.
6. Construir UX USER completa y fixtures de todas las casuísticas.
7. Ejecutar PostgreSQL/HTTP/browser real, regresión CFE, doble review independiente y CI exact-head.

No se avanza a la tarea siguiente con findings P0–P2 abiertos ni se declara live/homologado.
