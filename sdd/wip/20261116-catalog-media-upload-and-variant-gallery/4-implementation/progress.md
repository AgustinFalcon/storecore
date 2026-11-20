# Progreso

## 2026-11-20 — MEDIA-NORMALIZE-003B-2 implementado, todavía inactivo

- `backend/media-worker` incorpora el protocolo V1 y tipos mínimos worker-local,
  preflight estructural, workspace `NOFOLLOW`/`CREATE_NEW`, decoder por SPI
  explícito, orientación EXIF cerrada, raster sRGB 8-bit, política sin metadata,
  encoder JPEG 0.90 baseline 4:4:4 / PNG Deflate y `WorkerMain` con el FQCN
  contractual.
- El fat jar fusiona servicios ImageIO y declara
  `MediaNormalizerWorkerMainKt`; Spring no depende del módulo. No se agregó
  `ProcessBuilder` productivo, factory, `Ready`, HTTP, DB, store, vendor,
  systemd ni activación.
- `mvn -B test` quedó verde con `24` pruebas, `0` failures, `0` errors y `1`
  skip por symlink no disponible en Windows. Incluye JPEG/PNG serial y
  concurrente, un WebP lossless real, framing adversarial, límites,
  `WorkerMain`, workspace y las pruebas supply-chain preexistentes.
- El host local es Microsoft JDK `21.0.12.1+1-LTS`, no Temurin
  `21.0.13+9`; por eso no se registran hashes golden nuevos. Se exige
  determinismo intra-run y el golden exacto queda para el runtime fijado.
- `MEDIA-NORMALIZE-003B-2` permanece abierta hasta CI y doble review exact-head.
  `003`, `003B`, `003B-3`, `003B-4`, `004` y TASK-005 siguen abiertos.
  `Ready`, launcher productivo y contención/attestación pertenecen a cortes
  posteriores.

## 2026-11-20 — merge PR #307 y arranque de MEDIA-NORMALIZE-003B-2

- PR #307 quedó fusionado. Head revisado
  `ffaaab4ebf19020d2d95845bbb0e067d7597eba4`. Merge
  `ee1fa96edc0eb1c2722000b3980acecb15706ef7` (padre adicional `96449fa` de
  PR #308). `master` contiene `ffaaab4`.
- Verify #828, run `44784133698`, 5/5 sobre `ffaaab4`. Reviews exact-head
  de arquitectura y seguridad aprobaron sin P0–P3; dictámenes en
  `sdd/reviews/20261120-sol-pr307-architecture.md` y
  `sdd/reviews/20261120-sol-pr307-security.md` fuera de ese SHA.
- `MEDIA-NORMALIZE-003B-1` queda cerrada. `MEDIA-NORMALIZE-003`, `003B`,
  `003B-2..4`, `004` y TASK-005 continúan abiertas.
- Verify post-merge #832, run `44787086178`, terminó 5/5 verde sobre
  `ee1fa96`.

## 2026-11-20 — merge PR #306 y arranque de MEDIA-NORMALIZE-003B-1

- PR #306 quedó fusionado en `master`. Head revisado
  `4efbee490736627ff6185fef4d8a99cee358d125`. Merge
  `e2571fdff4784542dabbc45918f0d2cae703e42f`.
- Verify #825, run `44548801998`, 5/5 sobre `4efbee4`. Las reviews finales
  exact-head de arquitectura y seguridad aprobaron ese SHA sin P0–P3; los
  dictámenes se registran en `sdd/reviews/20261120-sol-pr306-architecture.md` y
  `sdd/reviews/20261120-sol-pr306-security.md` para no invalidar el SHA
  fusionado. Las reviews de `6fc0312` no son evidencia de merge.
- Verify post-merge #826, run `44781802512`, terminó 5/5 verde sobre
  `e2571fd`: higiene, backend, frontend y ambas matrices E2E reales.
- `MEDIA-NORMALIZE-003A` queda cerrada. `MEDIA-NORMALIZE-003`, `003B`,
  `003B-1..4`, `004` y TASK-005 continúan abiertas.
- `MEDIA-NORMALIZE-003B-1` agrega el módulo `backend/media-worker` fuera del
  classpath de Spring: TwelveMonkeys 3.15.3 mínimo, Enforcer, SBOM CycloneDX
  JSON con hashes, allowlist de licencias, inventario ImageIO cerrado y pin
  Temurin `21.0.13+9` en CI. No hay bean, caller, endpoint, engine ni
  activación. El corte no acredita `Ready`.
- Verify #827, run `44783620909`, falló el step `Pin Temurin 21.0.13+9` en
  backend y ambas matrices E2E: `setup-java` sí resolvió
  `/opt/hostedtoolcache/Java_Temurin-Hotspot_jdk/21.0.13-9/x64`, pero el probe
  leía sólo stdout y `java -XshowSettings:properties` escribe a stderr, así
  que `java.vendor` quedó vacío. El pin ahora consume stdout+stderr. No es
  fallo del módulo ni de Trivy. `003B-1` permanece abierta hasta CI 5/5 y
  reviews exact-head.

## 2026-11-19 — cierre exact-head del protocolo del worker aislado

- PR #306 congela `MEDIA-NORMALIZE-003A` sobre head
  `6fc0312df977d2d88aa06665362a8c52b0092ec0`, basado en
  `878e17e5d745db53de0699ca1b0b62ca4a3e5ddf`.
- Verify #824, run `44546311203`, terminó 5/5 verde: higiene, backend con
  PostgreSQL/interlock, frontend y ambas matrices E2E reales.
- Las revisiones finales independientes de arquitectura y seguridad aprobaron
  el mismo SHA sin P0–P3. Los dictámenes están en
  `sdd/reviews/20261119-sol-pr306-architecture.md` y
  `sdd/reviews/20261119-sol-pr306-security.md`.
- `MEDIA-NORMALIZE-003A` queda cerrada. `MEDIA-NORMALIZE-003`, `003B`, `004` y
  TASK-005 continúan abiertas. No se acredita decoder/encoder real, launcher
  productivo, contención del SO, HTTP, base, proveedor live, secretos, deploy
  ni homologación.

## 2026-11-18 — protocolo del worker aislado en implementación

- `MEDIA-NORMALIZE-003A` agrega un manifest binario V1 con framing y consumo
  exactos, UUID y nonce de 256 bits, perfil/límites/digests tipados, bytes
  reservados en cero y estados/rechazos cerrados con `Unknown` fail-closed.
- La orquestación publica la fuente una sola vez bajo límite real, compara el
  tamaño declarado, liga la respuesta a UUID+nonce, lee la respuesta mediante
  el lease validado, exige digest/tamaño al reclamar el artefacto y traduce
  timeout, aislamiento y fallo mediante resultados cerrados.
- Los contratos compartidos separan workspace, lanzamiento y normalización.
  Producción contiene esos puertos pero no un launcher concreto: la capacidad
  permanece `Unavailable`. Un adapter ProcessBuilder sólo de test ejecuta un
  helper genérico controlado con argumentos fijos, entorno vacío, diagnóstico
  acotado, deadline y kill-tree best-effort. Sus pruebas no convierten la
  enumeración de descendientes en una garantía contra la carrera inobservable
  de un proceso que nace y se desacopla entre sondeos.
- El workspace cubre symlinks, jerarquía, sweep, ownership y lifecycle mediante
  handles `NOFOLLOW`; response y output se leen y verifican dentro del lease.
  El worker/decoder real y la contención/attestación poseída por el SO permanecen
  diferidos a `MEDIA-NORMALIZE-003B`.
- Evidencia local previa al gate: `test-compile` verde y `22/22` tests focales verdes:
  protocolo, orquestación, workspace privado y launcher controlado de test. El
  cierre exact-head está registrado en la entrada del 19 de noviembre.
- `MEDIA-NORMALIZE-003B` conserva fuera del corte el launcher productivo, worker
  ImageIO real, TwelveMonkeys, salida JPEG/PNG, self-test/SBOM y attestación
  Linux. HTTP, base, proveedor live, secretos, deploy y homologación siguen
  fuera.

## 2026-11-18 — contrato de normalización segura en implementación

- `MEDIA-NORMALIZE-001` fija mediante ADR un helper JVM aislado y perfil
  versionado, sin agregar todavía librerías ni binarios.
- Se agregan límites numéricos inmutables, perfiles/rechazos cerrados, decisión
  de dimensiones fail-closed y un puerto de normalización con artefacto opaco.
- `MEDIA-NORMALIZE-002` agrega un parser estructural puro y acotado para
  JPEG/PNG/WebP con EOF exacto, animación, límites de segmentos/metadata y
  dimensiones tipadas. Permanece en validación hasta completar sus gates.
- Worker, decoder, corpus adversarial completo, multipart, HTTP, persistencia,
  proveedor live y homologación permanecen fuera. TASK-005 continúa abierta
  hasta MEDIA-NORMALIZE-003..004 y los gates exact-head del subcorte completo.
- El candidato `ad6b5bf7cb0ad9234a65bd58f9d0f2b2002aa623` pasó Verify
  #821, run `44439086194`, con 5/5 jobs: higiene, backend
  PostgreSQL/interlock, frontend y ambas matrices E2E reales. La evidencia
  focal local fue `14/14` y `test-compile` verde.
- Cuatro rondas preventivas corrigieron límites de geometría/salida, factories
  con `copy`, framing PNG, flags/orden WebP, markers JPEG y fuerza de sus
  regresiones. Las revisiones exact-head de arquitectura/producto y seguridad
  aprobaron sin P0–P3; quedan registradas en
  `sdd/reviews/20261118-sol-pr305-architecture.md` y
  `sdd/reviews/20261118-sol-pr305-security.md`.
- MEDIA-NORMALIZE-001 y MEDIA-NORMALIZE-002 quedan cerradas. El commit
  documental de cierre debe repetir CI y revisiones exact-head antes del merge;
  MEDIA-NORMALIZE-003/004 y TASK-005 continúan abiertos.

## 2026-11-18 — cierre de carreras de alta atómica en validación

- Subcorte `MEDIA-CREATE-004` basado en `master@311098a9615643898de606a6f13412ebb1873f22`,
  merge del PR #303. No cambia el contrato productivo ni agrega HTTP, proveedor
  live, secretos, deploy u homologación.
- El corpus PostgreSQL de alta atómica crece de 7 a 11 escenarios y agrega
  carreras reales contra expiración/cleanup, borrado humano y settlement de
  upload. Cada carrera exige un único resultado serializable y comprueba que
  producto, variantes, stock, ledger, receipt, draft, asset y delete queue no
  queden en una combinación parcial.
- Se agregó una constraint trigger `DEFERRABLE INITIALLY DEFERRED` aislada en
  la base de prueba para demostrar que un fallo en commit revierte el agregado,
  el receipt y las transiciones de staging completas.
- `test-compile` quedó verde. El corpus de dominio quedó `4/4`; los 11 casos
  PostgreSQL compilaron y fueron omitidos localmente porque Docker no está
  disponible. `MEDIA-CREATE-004` permanece abierta hasta que el CI alojado
  ejecute PostgreSQL 16 sobre el SHA candidato y las revisiones exact-head den
  APPROVE.
- Dos revisiones preventivas independientes encontraron tres P2 sólo en la
  fuerza probatoria de los tests: resultado `SKIP LOCKED` demasiado rígido,
  sleeps sin concurrencia observable y excepción diferida demasiado amplia.
  Se corrigieron con pasada de reconciliación, dos sesiones bloqueadas
  observadas en `pg_stat_activity` y causa PostgreSQL `P0001` con mensaje
  exclusivo. La segunda pasada quedó APPROVED sin P0–P3; no sustituye los
  gates exact-head posteriores al CI.
- Verify #817 ejecutó el primer candidato completo: 5/5 jobs verdes y 583
  pruebas backend, incluido PostgreSQL 16 e interlock. La primera revisión
  exact-head posterior rechazó un P2 probatorio: el caso cleanup aún podía
  recorrer sólo órdenes seriales. Se reemplazó por un interlock determinista:
  creación retiene draft y espera asset, cleanup demuestra `SKIP LOCKED=0`,
  luego creación revierte y la reconciliación exige `1/1`. Este cambio invalida
  el SHA/review previo; CI y ambas revisiones deben repetirse sobre el nuevo
  candidato antes del cierre.
- El candidato corregido `b60d664be48fee4462a62508d66ea89bb6d6d2a1`
  quedó 5/5 verde en Verify #818, intento 2. El primer intento sólo falló antes
  del código por resolución transitoria de Maven Central; se reintentó el job
  fallido sin mover el SHA. Backend ejecutó el corpus PostgreSQL 16 de 11 casos
  y las dos matrices E2E reales quedaron verdes.
- Dos revisiones exact-head independientes de arquitectura/concurrencia y
  seguridad/TOCTOU aprobaron sin P0–P3. Sus dictámenes están en
  `sdd/reviews/20261118-sol-pr304-architecture.md` y
  `sdd/reviews/20261118-sol-pr304-security.md`. MEDIA-CREATE-004 queda cerrada;
  TASK-003 y TASK-008 siguen abiertas por sus residuales posteriores. El commit
  documental de cierre debe repetir CI y revisión exact-head antes del merge.

## 2026-11-18 — alta atómica local en implementación

- Baseline `master@a48ac15525f1443f65897883a87a4840da9b0fd6`, merge de PR
  #302; incluye composición CAS #301 y cleanup durable #302.
- Dos revisiones preventivas GPT-6.1 Sol confirmaron el corte create-only y
  exigieron receipt durable, replay independiente de la proyección, revalidación
  temporal posterior a esperas y ausencia de I/O externo.
- MEDIA-CREATE-001..004 quedan habilitadas. No se declara cierre ni evidencia
  exact-head hasta completar implementación, CI y reviews finales.
- MEDIA-CREATE-001..003 quedaron implementadas en el dirty tree: comando y
  ledger con estados cerrados, hash length-prefixed, codec estricto, V30 y
  adapter `REQUIRED` sin I/O externo. Los rechazos posteriores al primer write
  abortan la transacción; replay/scope previos retornan sin marcar rollback-only.
- Dos revisiones preventivas Sol detectaron y se corrigió replay dentro de
  transacción caller, mutabilidad de attributes, versión decimal/receipts sin
  límites, strings de estado y una fixture TTL inválida. La segunda pasada no
  encontró P0–P2; su P3 de evidencia se cerró observando el lock real mediante
  `pg_stat_activity` antes de dejar vencer el draft.
- `test-compile` completo verde y corpus de dominio/codec `4/4` verde. La clase
  PostgreSQL compila y contiene creación/replay histórico, rollback, permisos,
  expiración, asset inválido, duplicado concurrente, espera de asset y upgrade
  V29→V30; Testcontainers se omitió localmente porque Docker no está disponible.
  MEDIA-CREATE-004 y el gate exact-head permanecen abiertos hasta CI alojado y
  cobertura adicional de races cleanup/delete/settlement y constraint diferida.
- Candidato funcional `021d2bf36df1f544d671e992b24f6de033316002`:
  Verify #812, run `44412770320`, terminó 5/5 verde (higiene, backend
  PostgreSQL/interlock, frontend y ambas matrices E2E reales). Dos revisiones
  independientes GPT-6.1 Sol medium sobre base `a48ac155` y ese head exacto
  dieron APPROVE sin P0–P3. Los dictámenes quedan registrados en
  `sdd/reviews/20261118-sol-pr303-architecture.md` y
  `sdd/reviews/20261118-sol-pr303-security.md`.
- Este close-out sólo acredita el subcorte create-only. MEDIA-CREATE-004,
  TASK-003 y TASK-008 continúan abiertas por sus residuales expresos; no se
  habilita HTTP media, proveedor live, deploy ni homologación.

## 2026-11-18 — expiración y barrido durable de drafts en validación

- Subcorte de TASK-003 basado en `master@1506027aadab43b860c661017d20f9543da6bbab`,
  merge de PR #301 cuyo candidato final fue
  `ad077964f957a421178ea5a0703b8fe0980e0f1b`.
- El contrato técnico se amplió antes de implementar. Un puerto separado
  compone expiración OPEN→EXPIRED y registro durable de ORPHAN_GC como fases
  recuperables; ambas usan reloj PostgreSQL y lotes tipados de 1–100.
- El barrido conserva drafts, assets y comandos históricos, omite referencias
  productivas y leases upload vivas, fencea leases vencidas y reutiliza V28.
  El worker delete existente hace I/O externo y reconcilia puts tardíos.
- Locks de cleanup: assets UUID → upload → delete, sin adquirir producto ni
  draft después del asset. Claim upload toma draft antes del asset y consulta
  el reloj después de obtener el lock para rechazar expiración durante espera.
- V29 agrega índices parciales de drafts abiertos por expiry y assets candidatos
  por UUID; V1–V28 permanecen inmutables. No cambia permisos runtime.
- Compilación main/test completa aprobada; dominio focal `18/18` verde. La
  ejecución focal PostgreSQL terminó con `0` failures y `3` errores de setup:
  Docker no está disponible, por lo que no ejecutó los cuerpos de pruebas.
  Incluye tests escritos de runtime role, dos sweepers, espera draft/asset,
  attach/cleanup, rollback, reinicio, fencing/put tardío y upgrade V28→V29.
- Review estática preventiva aprobada sin P0–P3 tras corregir el cutoff del
  reloj después de todos los locks; no acredita CI ni review sobre SHA congelado.
- TASK-003 sigue abierta por alta atómica. Sin HTTP, decoder, proveedor live,
  secretos, deploy ni homologación.

## 2026-11-16

- Issue #7 y baseline single-tenant auditados.
- Confirmado: galería de producto y orden ya existen; upload, ownership de asset
  y vínculo por variante no existen en runtime.
- Especificaciones funcional y técnica creadas para revisión independiente.
- No se creó código, migración, dependencia ni configuración de proveedor.
- Cuatro rondas Astra Product/UX y Security cerradas en APPROVE, sin P0–P3.
- Plan de 15 tareas aprobado por el owner el 2026-11-16 mediante instrucción de
  continuidad total. La implementación queda habilitada en PR separado.
- Exact-head detectó interlock legacy, keyword de cierre y DAG documental; fueron
  corregidos antes del gate final. Cloudinary live continúa sin GO.
- El DAG final ejecuta E2E/CI antes de tres reviews paralelas sobre SHA congelado;
  merge/post-merge sólo se registran después de las tres aprobaciones.

## 2026-11-18 — corte de dominio y almacenamiento privado

- TASK-001 implementada en Kotlin y Angular: estados cerrados, `Unknown`
  fail-closed, IDs/digest/dimensiones/alt/URL/path tipados y seis contratos de
  pasos independientes.
- TASK-004 implementada sin proveedor live: `MediaObjectStore`, resultados
  cerrados, adapter productivo `Unconfigured` y adapter determinista aislado en
  tests. El adapter copia bytes, impide overwrite, exige digest exacto para
  borrar y sólo entrega bytes mediante un grant emitido, exacto y vigente.
- Corpus común Kotlin/TypeScript cubre forma HTTPS canónica, allowlist exacta,
  userinfo/fragmento, dot-segments, UTF-8 inválido, caracteres de formato,
  UUID canónico y enteros seguros de IDs.
- Evidencia focalizada: Maven media `7/7`; Angular media `3/3`.
- Gate frontend completo: arquitectura y smoke aprobados, lint aprobado,
  `225` archivos / `1613` tests aprobados y build productivo aprobado (warning
  preexistente: bundle inicial 705,48 kB contra budget 700 kB).
- La suite Maven completa compiló y alcanzó ejecución, pero el host local no
  tenía Docker disponible: `215` errores de infraestructura Testcontainers,
  `0` failures. El CI alojado deberá ejecutar la evidencia PostgreSQL completa.
- Las reviews coordinadas funcional/código y seguridad aprobaron el snapshot
  corregido sin P0–P3 abiertos.
- No se agregó migración, endpoint, secreto, dependencia de decoder ni adapter
  Cloudinary. El gate externo continúa cerrado.

## 2026-11-18 — corte de persistencia V27 en validación

- Rama `feat/catalog-media-schema-20261118` basada en el merge de PR #298
  (`b95913ce19e2ebbe344a1012a309284debb02a5c`).
- TASK-002 está `in_progress`: se agregó V27 forward-only sin modificar V1–V26,
  con drafts/assets/comandos, ownership compuesto, identidad inmutable,
  outcome terminal cerrado, leases/fencing, revisión positiva y asociaciones
  producto/variante.
- El upgrade legacy preserva todas las filas legales, normaliza empates por
  `(sort_order,id)`, conserva portada existente o elige la primera, mantiene
  galerías de más de veinte elementos y backfillea alt desde el nombre.
- Portadas de producto y variante se validan al commit y serializan por el padre
  autoritativo para cerrar write-skew; las pruebas incluyen dos conexiones y
  operaciones reales bajo `SET ROLE storecore_runtime`.
- El marcador catálogo avanza de 2 a 3. El gate CI construye el artefacto real
  del SHA base, migra PostgreSQL 16, persiste media `MANAGED`, exige rechazo 78
  antes del JVM y comprueba que la galería no cambió.
- Evidencia local disponible: compilación backend y test-compile aprobados;
  dominio media `3/3`; frontend arquitectura/smoke/lint, `225` archivos y
  `1613` tests, y build productivo aprobados. Docker local continúa ausente, por
  lo que clean/upgrade/concurrencia/interlock real quedan pendientes de CI.
- Reviews preliminares GPT-6.1 Sol detectaron outcome nullable, write-skew,
  ausencia de `SET ROLE` y evidencia sintética; los cuatro puntos fueron
  corregidos. El dictamen final y TASK-002 `done` requieren SHA congelado y CI.

## 2026-11-18 — persistencia integrada y comandos durables en progreso

- PR #299 quedó fusionado en `master` como `37560b8`. El SHA candidato
  `1ffdc0bb189901d1054b125dcdeb5b23c2f0720f` recibió APPROVE funcional y de
  seguridad GPT-6.1 Sol, sin P0–P3; Verify #800 terminó 5/5, incluido backend
  con 527 tests, PostgreSQL 16, interlock real, frontend y ambas matrices E2E.
- TASK-002 pasa a `done`. TASK-003 continúa `in_progress` en
  `feat/catalog-media-commands-20261118`.
- V28 agrega una cola de borrado separada del upload, con propósito/estado/
  outcome cerrados, lease, fence, intentos y tombstone durable. V27 permanece
  inmutable.
- La cola no declara ausencia remota permanente: un `put` viejo puede terminar
  después de perder su fence. Por eso `TOMBSTONED` sigue siendo reclamable y
  reconcilia periódicamente mediante `head` + `deleteIfDigest`.
- El corte actual implementa registro/replay estable, ownership de staging,
  leases/fencing de upload, Tx-B validada, recovery sin inventar bytes y worker
  delete/GC sin I/O externo dentro de transacciones.
- La revisión preliminar Sol detectó y se corrigió: reclaim de leases delete
  vencidos, settlement atómico bajo lock/fence/deadline, rollback obligatorio de
  transiciones dobles, outcomes terminales no nulos y replay independiente del
  `assetId`/key regenerado por el cliente.
- La huella del upload ahora se construye canónicamente en el dominio desde el
  scope y todos los metadatos inmutables. El flujo separa registro humano de
  ejecución post-commit y un guard explícito rechaza I/O remoto con una
  transacción activa.
- La prueba PostgreSQL se ejecuta con `SET ROLE storecore_runtime` y cubre crash
  y reclaim, claimant stale, tombstone reconciliable, checks terminales y el
  guard transaccional. Evidencia local: compile/test-compile verde y 9/9 tests
  focales sin Docker; Testcontainers queda para el CI alojado porque Docker no
  está disponible en este host.
- La tercera ronda coordinada GPT-6.1 Sol (arquitectura/funcional y
  concurrencia/seguridad) aprobó el subcorte sin P0–P3 abiertos. La aprobación
  es estática y deberá repetirse sobre el SHA exacto después del CI.
- El CAS de composición y sus locks attach/delete/GC permanecen pendientes en
  el siguiente subcorte de TASK-003. HTTP, decoder y proveedor live siguen fuera.

## 2026-11-18 — composición CAS y protocolo de locks en validación

- PR #300 quedó fusionado en `master` como `07a0717`. Su candidato exacto
  `a6d39499a18c2432fb0956db0a0da6d9432814a8` recibió dos APPROVE GPT-6.1 Sol
  sin P0–P3 y Verify #802 terminó 5/5: higiene, backend PostgreSQL/interlock,
  frontend y ambas matrices E2E reales.
- El nuevo subcorte de TASK-003 agrega un puerto separado de composición para
  productos existentes, revisión positiva segura, referencias selladas a
  imágenes publicadas o assets de staging, validación 20/12, orden contiguo y
  una portada exacta por galería no vacía.
- El CAS conserva `productImageId`, reemplaza asociaciones y auditoría en una
  transacción, permite a otro ADMIN mantener una asociación publicada sin leer
  staging ajeno y exige ownership exacto para adjuntar staging nuevo.
- Se normalizó el orden global de locks a producto → draft → variantes → assets
  UUID → upload commands → delete commands. Los joins `FOR UPDATE OF` dejaron
  de usarse como supuesto de orden; claim delete conserva su transacción corta
  command-only antes de I/O.
- Las revisiones preliminares detectaron y se corrigió: detach no re-adjuntable,
  traducción duplicada de source, `SET CONSTRAINTS ALL` filtrado a la transacción
  caller y alt legacy legal en DB pero inválido para el dominio estricto.
- La evidencia agregada cubre dos CAS con igual revisión, dos CAS en una
  transacción externa, rollback por fallo de auditoría, detach/reattach,
  attach frente a delete/GC, rol runtime y fallback legacy fail-closed.
- Evidencia local disponible: compilación completa verde y 10/10 tests de
  dominio. PostgreSQL/Testcontainers queda para CI alojado porque Docker no está
  disponible en este host. El subcorte todavía no es cierre de TASK-003 ni
  autoriza HTTP, decoder, proveedor live, deploy u homologación.
