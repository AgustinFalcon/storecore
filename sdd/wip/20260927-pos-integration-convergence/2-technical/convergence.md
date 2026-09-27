# Diseño técnico — inventario y cortes de convergencia

**Estado:** `ready_for_baseline_contract_harness`. ADR-001 adjudicó el contrato de trabajo con doble GO Astra para POSC-000; POSC-000A y los cortes de implementación siguen pendientes. Ver `sdd/reviews/20260927-posc000-dual-adr-go.md`.

## Evidencia de ramas (2026-09-27)

Base común `5d28a76`. Desde esa base, `origin/integration/storecore-int` contiene 145 commits y `fix/storecore-pos-contract-readiness` 23; esta última tiene además 32 tracked modificados y 97 untracked. Los números describen inventario, no calidad ni completitud. La rama de preparación es fuente de piezas a inspeccionar, no fuente de migraciones para cherry-pick masivo.

**Gate contractual P1:** el YAML integrado y servido por StoreCore tiene SHA-256 `7B907A2E11C52A66B7253407FB3F9450CAE7B792BECCF34C1636BE9D3945DE30`, que coincide con el pin BlackStore. El YAML dirty de readiness tiene `2AEACCD5E1AA3990CF514DAC5C241DBF6E9420999426C89768FCEF05FDFCB7FD` (+108/-43 líneas) y también dice `1.0.0-draft`. `adr/ADR-001-contract-adjudication.md` adjudicó conservar el baseline integrado y diferir los cambios de SKU 64/128, selector bearer, ETag/304, override, 409, `expiresAt` y reconcile. POSC-000A aún debe validar parser/fixtures/digest antes de DTOs o porteo; no se sobreescribe la copia servida por aproximación.

### Matriz de esquema y ownership

| Área | Integración publicada (`56baa2d`) | Preparación POS (`0f2b21a` + dirty) | Resolución exigida |
|---|---|---|---|
| V4 | `V4__mp_orders_checkout.sql`: pagos/órdenes/MP | `V4__durable_checkout_claim_recovery.sql`: claim de checkout | V4 de integración es inmutable. Extraer sólo el delta de recovery y validarlo en una migración futura libre, sin recrear pagos ni alterar checks incompatibles. |
| V5 | `V5__blackstore_integration_registry.sql`: registry, config v2, companion/credentials | `V5__ml_inbox_reconciliation_and_backoff.sql`: inbox ML | V5 de integración es inmutable. Migrar delta ML aparte con preflight de columnas/índices; no sembrar de nuevo companion. |
| V6 | `V6__blackstore_integration_saga.sql`: operación, tombstone, líneas, cursor y pairing ledger | `V6__blackstore_companion_capability.sql`: capability/ACL/registry | V6 de integración es inmutable. Comparar constraints, funciones, scopes y grants; portar sólo endurecimientos compatibles por ALTER posterior. No DROP/CREATE ciego de tablas con datos. |
| V7 | `V7__blackstore_future_optional_promotion.sql`: promoción controlada de capability, módulo DISABLED | `V7__blackstore_saga_ledger.sql`: saga, reserva owner, ledger | V7 de integración es inmutable. Hacer diff de columnas, checks, claves y semántica de ledger; migrar aditivamente con backfill y pruebas de datos históricos. |
| V7.x local | No existe esa secuencia en integración base | `V7.1` ACL; `V7.1.1` selector credential; `V7.2` override audit; `V7.3` retry/retention; `V7.4`/`V7.4.1` expiry | No copiar esos nombres. Asignar versiones disponibles **al implementar**, en orden causal y verificando el head real. Portar permisos mínimos por rol y funciones definer con revisión de search_path, owner y EXECUTE. |
| Tablas `blackstore_*` | Registry y saga ya existen por V5/V6 | Variantes de las mismas tablas más columnas/índices nuevos | Integración conserva ownership de tablas. Cada delta declara preflight comprobable, backfill, constraints y rollback operativo; jamás borrar receipts/tombstones/ledger. |
| Inventario | `inventory_reservations`, `inventory_balances`, `inventory_ledger` existentes | `owner_channel` y pairing más estricto en V7 local | Contrastar todos los writers WEB/ML, ampliar sólo checks necesarios y verificar que WEB previo continúa válido; EXTERNAL_BLACKSTORE no registra `SALE`. |
| Control de runtime | Permisos y funciones del baseline actual | ACL mínima y roles de expiry worker en V7.x | Deny-by-default con tests positivos y negativos sobre roles reales, sin DDL para runtime ni escritura directa en registry/audit. |

Los nombres de versiones futuras **no se fijan aquí**: se determinan tras leer el `flyway_schema_history` del head de integración y la lista de migraciones en ese instante. Nunca editar contenido/checksum de un V1–V7 aplicado ni usar `repair` para disimular divergencia. Probar desde base vacía y desde snapshot con datos V1–V7; si un preflight falla se detiene la migración y se documenta el caso.

### Matriz de rutas y autoridad

El adapter publicado `BlackStoreIntegrationController` posee las siete rutas de negocio y `/openapi.yaml`. La preparación las reparte entre controladores. Una sustitución es atómica por ruta y no puede registrar ambas clases bajo el mismo contexto Spring.

| Ruta contractual bajo `/blackstore-integration/v1` | Owner publicado | Destino propuesto por ADR-001 | Gate de porteo pendiente |
|---|---|---|---|
| `GET /catalog` | `BlackStoreIntegrationController` | `BlackStoreCatalogController` | Elegir read adapter/cursor; ETag/304, coste por scope y filtro de items; una ruta. |
| `GET /stock/variants/{variantId}` | mismo | `BlackStoreCatalogController` | `stock:read`, safety stock neto y aislamiento de companion; una ruta. |
| `POST /reservations` | mismo | `PosReservationController` | Tx-A/Tx-B, cuádruple, hash, stock locks y errores 409/422; una ruta. |
| `POST /reservations/{reservationRef}/commit` | mismo | `PosReservationCommandController` | Commit/ledger/idempotencia y recovery; una ruta. |
| `POST /reservations/{reservationRef}/release` | mismo | `PosReservationCommandController` | Release/expiry concurrente y ownership WEB; una ruta. |
| `GET /operations/{operationId}` | mismo | `PosOperationReadController` | PENDING/durable/410/404; cuádruple completa; una ruta. |
| `POST /operations/reconcile` | mismo | `PosOperationReadController` | Caller-supplied receipts y cero escrituras; una ruta. |
| `GET /openapi.yaml` | mismo | sin reemplazo identificado | Mantener un owner explícito y contract test del YAML canónico, o moverlo de forma atómica. |

Los filtros/advice/envelope y service quota se revisan como parte del adapter elegido, no se mezclan parcialmente con la otra pila. Para cada corte, ejecutar un Spring mapping inventory automatizado que falle ante duplicados y compare paths/verbo con el YAML; los tests de `identity.enabled=false` deben comprobar cierre de rutas y beans, no sólo ausencia de respuesta exitosa.

### Dependencias y decisiones antes de portear

- Confirmar la semántica actual de `BaseResponse`, scopes, autenticación companion y revocación de credenciales frente a la preparación, junto con la tipología `action_kind`/config v2. La selección de adapter decide qué ports sobreviven y cuáles son sólo fixtures históricos.
- Comparar SQL y modelo real por objeto (constraints, índices, funciones, triggers, grants) y registrar un ledger de deltas por versión futura; una coincidencia de nombre de tabla no prueba compatibilidad.
- Mantener `BLACKSTORE_INTEGRATION=DISABLED`, sin secreto real, sin listener live y sin cliente BlackStore durante los tests. Activación y topología son un PR/gate posterior con despliegue reversible y credenciales gestionadas fuera del repo.
- PIC-006A depende de la elección del adapter definitivo de **lectura GET/reconcile**, de su proxy transaccional real y de POSC-004A: sólo después existen retry/alert outbox/delivery/inbox que sus snapshots deben comprobar. Su evidencia no se debe certificar sobre una implementación que luego se descarta.

### Subcortes de evidencia y residuales

- **POSC-000A valida sólo el baseline integrado** con parser OpenAPI 3.1, fixtures por status y SHA-256 exacto. Conserva el método de PIC-008A sin acreditar su cierre histórico. PIC-008A de readiness sigue pendiente/diferido para la propuesta SKU 128/129; requeriría versión/digest coordinados si se adopta.
- **PIC-006A conserva su alcance de lectura:** tests PG16 de GET/reconcile por el proxy Spring real con `@Transactional(readOnly = true, isolation = REPEATABLE_READ)`, snapshots completos y ordenados antes/después (contenido y timestamps de saga, líneas, tombstone, retry, alert, audit, ledger, reservas y balances) y writer concurrente. Cubrir GET 404/PENDING/durable/410 y reconcile 0/501 inválidos, 500 válidos, duplicados aceptados y deduplicados conforme al YAML/adapter integrado, orden de la respuesta observada, ajenos/revocados/retirados. Un fixture que exija 400 por duplicados es de la propuesta dirty y sigue pendiente de versión coordinada. No modifica código productivo, Flyway, ACL, `pom.xml` ni configuración compartida; no valida commit/release ni recovery mutante.
- **Harness PG16 de integración general** es POSC-001, separado de PIC-008A/PIC-006A: migración limpia y upgrade con datos, rutas únicas, rol runtime/worker, stock, concurrencia y ledger. Sus pruebas no se atribuyen a los subcortes originales.
- **Purge/retention** quedan como gate explícito: terminales a 90 días sólo tras reloj DB/`terminal_at`, INSERT tombstone de ≥7 años antes de DELETE retry→líneas→saga bajo lock de cuádruple, sin borrar ledger ni audit. La función worker-only, revocación de DELETE directo runtime y prueba de rollback/race no existen por asumir V7.3; si no entran en un corte revisado, se registran como residual NO-GO de purge y no se anuncia cierre operativo.
- **Expiry/poison/ACL** quedan como gate explícito: owner WEB y EXTERNAL_BLACKSTORE disjuntos, lock advisory→saga→balances ASC→reservas, commit contra TTL bajo lock, selector que no filtra inconsistencias, retry CAS, cuarentena/alerta/audit atómicas y prueba de carrera WEB/PIC/commit. El worker mutante utiliza identidad DB estrecha, distinta del runtime, sin DML directo a audit/outbox y con tests de permisos efectivos. Si estos elementos no se portan/verifican, el worker y el conector permanecen NO-GO.
- **Bridge legado de stock ML:** integración `#52` ya sella el writer BlackStore directo: `LegacyBlackStoreProjectionBridge` devuelve `NOT_ELIGIBLE`. Conservar esa barrera al portear saga; las pruebas deben exigir cero nueva escritura directa de `desired_quantity` y cero `LISTING_STOCK`, preservando filas históricas.

### Matriz de fixtures contractuales: baseline frente a propuesta diferida

Cada fixture de POSC-000A debe derivarse del YAML `7B907...DE30`. Los de la columna derecha pertenecen a `2AEAC...B7FD` y no pueden aprobarse bajo el digest integrado por semejanza de nombres.

| Superficie | POSC-000A baseline `7B907` | PIC-008A dirty/evolución `2AEACC` |
|---|---|---|
| SKU | Aceptar 64, rechazar 65 en campos con `maxLength: 64` | Aceptar 128, rechazar 129 donde declara `maxLength: 128` |
| Error 409 | Validar códigos permitidos por endpoint y envelope; texto describe `CONFLICT` retryable y `OPERATION_STATE_CONFLICT` no retryable | Validar además `if/then` de `retryable` y precedencia ampliada; no atribuirla al baseline |
| 410/PENDING/404 | Fixtures independientes: tombstone 410, GET PENDING 200, ausencia 404, 409 `CONFLICT` según texto de endpoint | Secuencia de precedencia 410 tombstone → 409 PENDING → 404 mismatch durable en commit/release |
| `lineFailures` | Validar forma cuando aparece; el baseline no impone `if/then` obligatorio/excluyente | `INSUFFICIENT_STOCK` lo exige con `minItems: 1` y lo prohíbe en otros errores |
| ETag/304 | `ETag` header `maxLength: 64`, 304 sin cuerpo conforme a schema publicado | `W/"<43>"` exacto, body digest raw y semántica de 304 más estrecha |
| Receipt/reconcile | OneOf PENDING/durable; `expiresAt` según schema baseline; `knownReceipts` 1..500 sin `uniqueItems`, adapter actual deduplica duplicados; 0/501 inválidos, 500 válidos | `expiresAt` required en RESERVED y duplicados 400 antes de leer; orden/aislamiento de receipts explícitos |

El harness PG16 de POSC-001 y el RO de PIC-006A prueban comportamiento real en otras capas; ninguno altera la validez de estos fixtures ni el estado pendiente del PIC-008A original.
