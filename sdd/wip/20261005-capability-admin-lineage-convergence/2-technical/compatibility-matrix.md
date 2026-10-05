# Matriz de compatibilidad y evidencia

| Linaje | Head publicado | Última migración | Siguiente corte | Permitido |
|---|---|---:|---:|---|
| `MASTER_V9` | `fcb431144278ab6cb4836df2e348710f88fa4dae` | V9 | V10 | Web commerce core; sin companion |
| `INTEGRATION_V19` | `0737130eb4e58f6abba9353c42ab3d35db33a297` | V19 | V20 | Integración revisada; companion permanece disabled |

## Evidencia mínima por instalación

- `flyway_schema_history`: version, description, checksum y success; sin credenciales ni payloads.
- Firmas exactas: `to_regprocedure`, owner, ACL directa y ACL heredada.
- `has_function_privilege` para `PUBLIC`, runtime y rol administrativo.
- Resultado de `flyway validate` antes y después.
- SHA de código, migraciones y suite de upgrade.

Un valor ausente, mezclado, desconocido o incompatible es `Unknown` y detiene el corte. No se completa con defaults ni se repara automáticamente.
