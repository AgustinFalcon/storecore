# Propuesta POSC-001 — harness PG16 del baseline integrado

**Estado:** `pending_spec_review`. Esta propuesta delimita un PR test-only posterior a POSC-000A. Requiere review y GO propios antes de que Luna implemente el harness. No cambia V1–V7, permisos, controllers, workers, OpenAPI ni estado de capability.

## Alcance verificable

1. **Topología Spring:** leer `RequestMappingHandlerMapping` en un contexto real y comparar el par método/ruta de las siete operaciones del YAML adjudicado más `GET /blackstore-integration/v1/openapi.yaml`. Hay exactamente un owner por par; hoy es `BlackStoreIntegrationController`. El inventario debe detectar duplicados, ausencias y rutas contractuales extra. Una entrada sintética duplicada y otra con OpenAPI ausente deben producir diagnósticos controlados en el verificador sin registrar controllers sombra productivos.
2. **Flyway PG16:** usar bases o esquemas aislados en Testcontainers. Una ruta migra desde vacío hasta V7. Otra aplica V1, siembra datos WEB válidos, avanza a V4, agrega datos de orden/pago válidos, avanza a V5, agrega companion/credential `DISABLED`, avanza a V6, agrega PENDING, RESERVED, COMMITTED y tombstone válidos (incluido `result_body NULL`), y finalmente aplica V7. Ajustar la fixture a las constraints reales de cada etapa, sin usar `repair` ni editar una migración aplicada. Comparar `flyway_schema_history`, definiciones relevantes de `pg_constraint`, `pg_proc`, `pg_indexes`, triggers y grants; verificar además que las filas sembradas conservan claves, contenido, estado, saldo y ledger. El esquema final debe ser compatible entre las dos rutas, sin exigir que datos de negocio distintos sean iguales.
3. **Runtime real:** reutilizar los escenarios PostgreSQL ya existentes de cuádruple concurrente con un receipt/reserva, idempotencia de commit, carrera commit/expire, tombstone 410 y `DISABLED` fail-closed. Agregar sólo observaciones necesarias para evitar falsos positivos en el baseline, con conexiones y transacciones reales. La comparación de snapshots completos y el proxy de `GET/reconcile` pertenecen a PIC-006A; el worker owner/poison/purge estrecho pertenece a POSC-004A.
4. **Roles actuales:** el usuario propietario de Testcontainers ejecuta Flyway y siembra. Para ACL, abrir una conexión separada con un login de prueba sin superusuario, miembro del rol NOLOGIN `storecore_runtime`, y verificar `current_user` efectivo. Afirmar grants con `has_table_privilege`, `has_sequence_privilege` y `has_function_privilege`, y ejecutar negativas apropiadas que produzcan SQLSTATE `42501`. Registrar `PUBLIC` y membresía. No usar sólo un `SET ROLE` desde superusuario como prueba de aislamiento.

## Matriz de permisos que el harness debe medir

| Principal del baseline V1–V7 | Estado observable | Criterio POSC-001 |
|---|---|---|
| Migrator/owner de Testcontainers | Aplica DDL y Flyway | Sólo preparar las dos rutas de instalación; no inferir permisos runtime. |
| `storecore_runtime` | V5/V6 conceden DML amplio sobre registry/saga; V3 concede lectura de configuración | Medir operaciones efectivas y fallos por rol, sin llamar a esos grants privilegio mínimo. Su reducción pertenece a POSC-002/004A. |
| `PUBLIC` | V3 vuelve a conceder `EXECUTE` sobre cuatro funciones `SECURITY DEFINER` | Registrar el grant efectivo como gap; la revocación y sus pruebas van en la migración futura revisada. |
| Worker dedicado | No existe un rol de base propio en V1–V7; `BlackStoreExpiryWorker` usa el datasource de aplicación | Registrar ausencia y comportamiento actual. Creación, función worker-only, revocación de DELETE y races quedan en POSC-004A. |

## Gate de aceptación propuesto para Sol/Astra

- El test de mapa falla de forma explícita con duplicado y ruta ausente sintéticos.
- Clean y upgrade con datos terminan en V7, sin checksums alterados ni pérdida de evidencia histórica.
- Las negativas ACL se ejecutan bajo un login no propietario y declaran la matriz del baseline, incluidos sus grants amplios; ninguna aserción anticipa el modelo futuro.
- Se conservan las pruebas offline de idempotencia, concurrencia, tombstone y fail-closed sin credenciales live. El reporte identifica commit Git, comando, número de tests y límites de cobertura.
- No se acredita PIC-008A, PIC-006A ni POSC-004A, ni se activa el companion.
