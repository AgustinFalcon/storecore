# POSC-002 — subcortes revisables de identidad y ACL

**Estado:** plan pendiente de review documental. La propuesta técnica obtuvo GO documental Astra acotado al camino POS en el snapshot d8dc971; ver sdd/reviews/20260928-posc002-shared-pos-spec-go.md. Ningún subcorte está implementado ni aprobado por código. Este plan descompone TASK-POSC-002 sin alterar el total 3/9 del DAG principal.

## Base, ownership y secuencia

El head de integración verificado para redactar es 9ce355b, con Flyway V1–V7. El snapshot ML ab81789 es anterior. Antes de cada subcorte se revalida head, árbol limpio, flyway_schema_history, firmas/owners/grants reales, mappings Spring y SHA del OpenAPI integrado. V8 es sólo candidato mientras esté libre. Las migraciones se agregan en orden; no se modifican V1–V7 ni se copian V7.x de readiness. Un solo PR y owner de migración cierra las funciones V3 y crea la infraestructura compartida ML/POS; el WIP ML referencia su SHA, pero sus callers REPEATABLE READ conservan NO-GO.

Cada PR apunta a integration/storecore-int y contiene evidencia local del SHA final y dos reviews independientes Astra estrictas antes de merge. La separación de commits no habilita desplegar un estado intermedio donde V3 esté revocado y CapabilityController aún dependa de sus firmas viejas. La migración shared y su reemplazo administrativo se integran como una unidad de despliegue. No se activa BLACKSTORE_INTEGRATION.

## POSC-002A — preflight y manifiesto de corte compartido

- **Dependencia:** POSC-001; sin migración ni código productivo.
- **Owner/artefactos:** inventario de V3–V7, cuatro rutas de CapabilityController, JdbcCapabilityService.decide, roles/grants efectivos y llamadas ML/POS; manifiesto por objeto/operación/rol; versión Flyway libre y rollback operativo.
- **Aceptación:** PostgreSQL 16 limpia y upgrade con datos muestran checksums y objetos antes de escribir SQL; enumera PUBLIC, runtime, admin, owners NOLOGIN y membership; confirma que inventory_balances necesita INSERT(variant_id) por lockBalance incluso con fila existente. La decisión shared adjudica una sola migración y una sola firma por función, con referencia cruzada en ML-DSP-000B. Si head/objeto difiere, se actualiza el plan antes del DDL.
- **Review:** Astra valida manifiesto y superficie de seguridad. Registro de head, versión y evidencia en el PR del corte shared.

## POSC-002B — administración capability compartida, roles y V3

- **Dependencia:** 002A. Es la unidad atómica de migración más reemplazo administrativo.
- **Ownership:** migración Flyway shared de ancla persistente y orden action→config→switch, owner NOLOGIN, roles y funciones administrativas SECURITY DEFINER estrechas; REVOKE de las cuatro firmas V3 para PUBLIC/runtime y grants sólo de firmas nuevas. No crea todavía el guard POS completo que lee companion/credential, auth_ready y scopes: éste depende del esquema 002C y pertenece a 002E. El adapter capability admin usa datasource y transaction manager separados. CapabilityController conserva sus cuatro rutas de estado/kill con USER ADMIN+CSRF y correlationId UUID **obligatorio** aportado por el cliente; su fallback a UUID generado en servidor se retira en el mismo cutover.
- **Protocolo admin completo:** 002B posee Tx-S runtime que valida USER ADMIN y sesión, consume/rota CSRF e inserta/confirma intent durable con correlation, hash y campos normalizados antes de prestar el pool admin. Tx-C capability admin bloquea comando, verifica intent/sesión/actor, toma ancla, aplica CAS/mutación/audit y persiste resultado terminal en un commit. Incluye tabla/funciones de intent y comando, adapter/controller/cliente capability, GET interno de status read-only y POST interno de recuperación. Correlation+payload idénticos recuperan resultado; correlation repetida con campos/hash distintos es conflicto sin efecto. Tras Tx-S ambiguo o pérdida de respuesta se usa CSRF nuevo y status/replay; sesión original expirada sólo permite leer resultado terminal o abortar PENDING por recuperación con mismo actor, nunca ejecutar ese intent desde otra sesión. El pool admin ausente falla cerrado y deja intent recuperable.
- **Aceptación:** admin READ COMMITTED toma action rows FOR UPDATE antes de config/switch; PG16 demuestra grants positivos/negativos con logins no propietarios y cierra spoofing de actor, search_path, wrapper y default grants. HTTP prueba las cuatro rutas con audit/correlation, carreras de doble CSRF, crash Tx-S→Tx-C, respuesta perdida, status, recuperación/abort y reautenticación; deniega CUSTOMER, OPERATOR, CSRF inválido, correlation ausente y pool ausente. No se revoca V3 en despliegue separado del reemplazo de rutas. El camino ML REPEATABLE READ queda sin activar hasta su prueba específica.
- **Review:** dos Astra sobre diff de SQL, adapter y pruebas; un solo deploy/rollback coherente. No dejar V3 público como fallback.

## POSC-002C — esquema y comando administrativo del companion

- **Dependencia:** 002B para Tx-S durable, protocolo de correlation/status/recuperación, rol/pool y orden de locks shared. Migración POS propia en siguiente versión libre.
- **Ownership:** backfill fail-closed de registry/credential V5, auth_ready falso para filas legacy, fingerprint/scopes/service_role, índice 0..1 y comandos del companion; nueve entry points exactos prepare/attach/status/abort/pair/activate/suspend/rotate/revoke y audit. Añade Tx-P para preparar/adjuntar secreto y consume Tx-S/Tx-C de 002B; no vuelve a implementar ni omite la semántica durable de intent/correlation. Secret provider idempotente y rutas internas USER ADMIN.
- **Aceptación:** provider prepara y resuelve antes de pair/rotate; replay de correlation devuelve metadata sin token/ref; primera entrega de bearer una sola vez y pérdida de respuesta obliga status+rotate; abort/discard seguro. CAS, razón, expectedVersion, actor USER real y CSRF durable. Upgrade preserva credential ACTIVE vieja en cuarentena hasta rotación explícita; limpia y upgrade mantienen DISABLED. Login admin sólo EXECUTE, runtime y PUBLIC sin DML/EXECUTE admin.
- **Review:** dos Astra de SQL, protocolo de secretos, rutas y race tests; sin credenciales reales en repo.

## POSC-002D — bearer opaco y principal en frontera HTTP

- **Dependencia de integración:** esquema/roles de 002C; el puerto, verifier y tests unitarios pueden prepararse en paralelo con 002C sin tocar su migración.
- **Ownership:** puerto de secret provider y verifier, principal inmutable, filtro/advice y matriz de scopes en BlackStoreIntegrationController; sin cambiar YAML pinneado.
- **Aceptación:** token aleatorio de al menos 256 bits; fingerprint selecciona pero comparación constante con bytes del provider autentica. Header de instancia no crea identidad. Missing/invalid/revoked → 401; outage temporal → 500 retryable; binding/scope/DISABLED/kill → 403; header/override inválido → 400 después de autenticación. BaseResponse exacto y logs/traces sin bearer/ref. includeCost=true denegado en POSC-002; cashier nunca recibe cost:read. GET openapi.yaml conserva owner/digest.
- **Review:** dos Astra sobre puerto, adapter HTTP y pruebas de contrato; fixture de transporte BlackStore resolveToken sintético.

## POSC-002E — guard transaccional en engine y lecturas

- **Dependencias:** 002B, 002C y 002D.
- **Ownership:** después de 002C, migración POS de pos_companion_effect_guard y pos_companion_read_guard completos, con owner/grants mínimos sobre action/config/switch/companion/credential y lectura de auth_ready/scopes. BlackStoreSagaPort/callers y JdbcBlackStoreSagaEngine reciben VerifiedCompanionPrincipal; efecto llama guard como primera consulta de Tx-A, re-POST Tx-B, commit y release. Lecturas GET/reconcile reciben principal y usan read guard como primer SELECT RR read-only con filtro client_instance_id.
- **Aceptación:** transacción mutante explícita READ COMMITTED; guard rechaza RR/Serializable antes del efecto, compara credential id/version y scopes bajo lock, y no llama al decide switch→config→action heredado. Admin-wins tras esperar ancla observa config/switch confirmado; effect-wins bloquea admin hasta commit/rollback. Revoke entre Tx-A/Tx-B deja PENDING recuperable sin reservar. No cambia fórmula de stock, ledger, regla de cuádruple ni estado de capability. GET ajeno 404 y reconcile ajeno unknownReceipts, sin lectura cruzada de tombstone.
- **Review:** dos Astra sobre engine real, locks y read port; pruebas de carrera con dos conexiones PG16.

## POSC-002F — matriz de aceptación y regresión

- **Dependencias:** 002B–002E integrados sobre un mismo head.
- **Ownership:** tests PG16 Testcontainers y HTTP loopback, sin código comercial nuevo.
- **Aceptación:** clean+upgrade V1–V7 con filas; diff de datos/grants/checksums; roles runtime/admin/migrator/ajeno reales; cursor UPSERT, inventory_balances INSERT(variant_id), catálogo/ajuste stock y WEB/ML sin regresión. Cubre bearer, provider outage, scopes, nueve comandos admin, CSRF, replay, revocación y kill contra Tx-A/Tx-B/commit/release, read RR y ownership A→B. No hay claim/ledger/stock al denegar; no doble descuento; digest YAML y mapa de ocho rutas sin duplicados. ML RR admin-wins se registra como gate separado NO-GO, sin convertir este test POS en su aprobación.
- **Review:** dos Astra sobre SHA final y evidencia numérica de suites/pruebas; registrar comandos, PG16, flyway_schema_history y resultados. El CI remoto no se presume verde.

## POSC-002G — rollout y transferencia al siguiente corte

- **Dependencia:** 002F sin P0–P2 abiertos.
- **Ownership:** runbook de instalación por VM, configuración del provider/pool admin por referencia, backup/preflight, ventana de cambio para V3, rollback operativo y observabilidad sin secretos.
- **Aceptación:** companion sigue DISABLED tras migrar; capacidad de apagar, revocar y recuperar PENDING demostrada. Se registra qué PR/SHA instaló el delta shared y cuál el POS, con dos reviews de código por PR. POSC-003 sólo recibe dependencia cumplida tras evidencia completa de 002A–G; POSC-004/004A, PIC-006A, conector live, fiscal y sdd.finish mantienen gates propios.
