# Plan de convergencia POS — gates secuenciales

Este plan está en `ready_for_posc002_implementation_plan_review`: POSC-000/000A/001 están done (3/9 tareas). POSC-001 cerró el harness test-only con 32 suites/142 tests locales y dos GO Astra de código (`sdd/reviews/20260927-posc001-dual-code-go.md`). POSC-002 tiene GO documental Astra acotado al camino POS sobre `d8dc971` (`sdd/reviews/20260928-posc002-shared-pos-spec-go.md`); los subcortes revisables 002A–G están en `3-tasks/posc002-implementation-slices.md` y requieren review propia del plan, pruebas y dos reviews de código por PR. La migración SECURITY DEFINER fue autorizada expresamente por el usuario, pero no está implementada. La referencia ML `ab81789` quedó atrás de `origin/integration/storecore-int=9ce355b`, con V1–V7; se revalida head/Flyway/YAML/rutas antes de tocar DDL. ML REPEATABLE READ y TASK-DSP-000B mantienen gate separado. PIC-006A conserva su alcance de lectura; PIC-008A histórico (SKU 128/129) sigue pendiente al conservar baseline 64/65.

## Corte 0 — adjudicación contractual y ownership (POSC-000, done documental)

Revisar la matriz técnica con Astra, inventariar migraciones y objetos reales del head, comparar los siete paths y elegir **un** adapter candidato por ruta. `ADR-001` documenta dos YAML `1.0.0-draft` distintos: integrado/servido/pinneado por BlackStore `7B907...DE30` y dirty readiness `2AEAC...B7FD`, con +108/-43 líneas. Adjudicar SKU, selector bearer, ETag/304, override, 409, `expiresAt` y reconcile; identificar qué ports/domain use cases se portan y cuáles se reemplazan. **Salida:** propuesta ADR con aceptar/rechazar/diferir por grupo y matriz de fixtures para POSC-000A, sin código/migraciones ni cambio de pin.

## Gate contractual del baseline inspirado en PIC-008A (POSC-000A, done)

El harness validó el YAML integrado con **parser OpenAPI 3.1 y fixtures sólo de lo que ese digest declara**, sin PostgreSQL, endpoint publicado ni cliente BlackStore. Cubrió SKU 64/65, códigos 409 por endpoint, tombstone 410, GET PENDING 200, ausencia 404, `lineFailures` cuando aparece, ETag/304, OneOf de receipt y reconcile 1..500 sin `uniqueItems`. No atribuye `if/then`, ETag débil exacto ni precedencia 410→409→404 de la propuesta dirty. Fijó SHA-256 de bytes exactos y cotejó copia servida y pin BlackStore. **Salida:** `sdd/reviews/20260927-posc000a-dual-contract-go.md` con doble GO acotado; versión/digest/pin invariantes. PIC-008A histórico y SKU 128/129 permanecen pendientes/diferidos a una evolución contractual coordinada.

## Corte 1 — harness PG16 de integración separado (POSC-001, done test-only)

La propuesta `2-technical/posc001-harness-proposal.md` recibió doble GO Astra y el diff de tres tests pasó 32 suites/142 tests locales y doble review de código tras corregir dos P2. El harness cubre mapa Spring, Flyway PG16 limpio + upgrade V1–V7 con datos y negativo bcrypt, roles efectivos del baseline, concurrencia, idempotencia y fallas sintéticas controladas. El worker aún no tiene rol DB propio en V1–V7; su brecha quedó registrada sin adelantar POSC-004A. **Salida:** `sdd/reviews/20260927-posc001-dual-code-go.md`; no se atribuye a PIC-008A ni PIC-006A.

## Corte 2 — identidad, capability y ACL

**Dependencia crítica del corte 2:** 002B sólo instala el ancla/shared y reemplaza la administración capability V3 con protocolo completo Tx-S durable → Tx-C, correlationId obligatorio del cliente, intent/comando persistidos, status y recuperación. Su migración y el adapter/controller/cliente capability forman un cutover atómico. 002C agrega el esquema companion con auth_ready/scopes y sus comandos consumiendo esa infraestructura; 002E, después de 002C, crea el guard POS completo que verifica companion/credential y lo conecta al engine. No declarar validado el guard POS desde 002B ni activar callers ML RR por el delta shared.

La propuesta técnica `2-technical/posc002-identity-acl-proposal.md` recibió GO documental Astra acotado al camino POS. Ejecutar sus subcortes 002A–G con la matriz `3-tasks/posc002-implementation-slices.md`: preflight, delta shared de cierre V3 más administración capability en despliegue atómico, delta POS de credencial/comandos, bearer/provider, guard en Tx-A/Tx-B/commit/release y lecturas, pruebas PG16/HTTP, y rollout. El delta shared tiene owner y Flyway únicos con ML-DSP-000B, pero el camino ML con transacciones RR requiere review y prueba separadas. El manifiesto preserva `INSERT(variant_id)` en `inventory_balances` para `lockBalance`, sin devolver DML amplio al runtime. El worker separado pertenece a POSC-004A: no revocar `DELETE` PENDING hasta tener reemplazo probado. **Salida futura:** companion 0..1, identidad y ACL sobre engine real, migración limpia+upgrade y dos reviews de código por PR. La capability sigue `DISABLED`.

## Corte 3 — catálogo y reserve

Seleccionar y portar read model/cursor/ETag/stock y reserva Tx-A/Tx-B, retirando en el mismo PR los handlers que colisionen. Preservar contratos 304/409/410/422/429, saleId+operationId, hash y precio versionado; probar stock con safety y reserva ya neta. **Salida:** un handler por ruta y PG16 idempotency/concurrency GO local.

## Corte 4 — commit, release y recovery

Portar commit/release y lectura GET/reconcile sobre el esquema migrado con un único owner por ruta. Verificar exactamente un `STOCK_COMMIT_EXTERNAL`, sin `SALE`, y que los reintentos no duplican decrementos. Conservar el bridge del PR #52: `NOT_ELIGIBLE`, cero escritura nueva directa a `desired_quantity` y `LISTING_STOCK`, histórico intacto. **Salida:** pruebas de saldo/ledger, 409/410 y timeout. GET/reconcile todavía requieren el subcorte PIC-006A para certificar read-only.

## Subcorte worker y purge (POSC-004A)

Portar sólo con decisión de esquema/roles revisada: worker EXTERNAL_BLACKSTORE distinto del WEB; advisory de cuádruple → saga → balances en orden de variante → reservas externas; commit comprueba TTL bajo lock y la carrera con expire no descuenta dos veces. Retry/poison usa CAS, cuarentena, audit+alerta atómicos y principal worker estrecho. Purge de terminales a 90 días conserva tombstone ≥7 años: INSERT tombstone → DELETE retry → líneas → saga en una Tx bajo lock; ledger/audit permanecen. Revocar DELETE directo runtime sólo cuando una función worker-only lo sustituya sin romper limpieza de PENDING. **Salida:** PG16 limpia+upgrade, negativos ACL, rollback y races WEB/PIC/commit/expire/purge. Si esto se difiere, documentar residual explícito y mantener NO-GO de cierre operativo.

## Subcorte PIC-006A — GET/reconcile read-only (POSC-006)

Sólo tras elegir e incorporar el adapter definitivo de lectura **y completar POSC-004A**, ejecutar tests PG16 **por proxy Spring real** que verifiquen `@Transactional(readOnly = true, isolation = REPEATABLE_READ)` efectivo. Comparar snapshots completos y ordenados antes/después, con payloads, estados y timestamps de saga/líneas/tombstones, retry, alert outbox/delivery/inbox, audit, ledger, reservas y balances. Cubrir GET 404/PENDING/durable/410; reconcile 0/501 inválidos, 500 válidos y duplicados aceptados/deduplicados por el adapter del baseline; registrar orden de respuesta, ajenos/revocados/retirados y writer concurrente con una fotografía consistente. El YAML integrado exige 1..500 receipts y no declara `uniqueItems`; el 400 por duplicados pertenece sólo al contrato dirty diferido. Una identidad revocada falla antes de leer receipts. Este subcorte no cambia código productivo, Flyway, ACL, `pom.xml` ni configuración compartida; tampoco certifica commit/release, recovery mutante o purge.

## Corte 5 — wire, topología y cierre offline

Después de PIC-006A y worker/purge, unificar error envelope `BaseResponse`, OpenAPI publicado, rate limits, headers, trazas y mapas de Spring. Revisar documentación operativa de instalación y rollback con módulo DISABLED; reejecutar suite de backend y aceptación cruzada BlackStore offline usando el digest adjudicado. **Salida:** dos reviews de código independientes sobre diff final, sin P0–P2 abiertos, y GO explícito de integración offline. El conector live, credenciales, fiscal y `sdd.finish` conservan gates independientes.

## Bloqueos honestos

- No existe GO actual para traer el worktree POS dirty ni para activar BlackStore. Los tests 288/48 del 24-Sep no prueban la base de integración 2026-09-27.
- GitHub CI puede no iniciar jobs por billing. Los tests locales se registran con comando, SHA y alcance; no se presentan como CI remoto verde.
- Toda migración que afecte funciones `SECURITY DEFINER` o privilegios necesita revisión de superficie/roles y pruebas PG16 explícitas antes de aplicarse. La compatibilidad de la base instalada decide el delta, no el nombre de archivo de la rama fuente.
- El YAML dirty no es equivalente al pin de BlackStore por compartir `1.0.0-draft`. ADR-001 conservó el pin integrado y POSC-000A lo validó; sin el gate de porteo no se transporta un contrato mixto. PIC-008A histórico permanece pendiente/diferido; no se marca done por el gate baseline.
