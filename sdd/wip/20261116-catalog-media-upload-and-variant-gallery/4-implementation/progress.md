# Progreso

## 2026-11-20 — 003B-4B descompuesto antes de código privilegiado

- Dos auditorías GPT-6.1 Sol sobre `master e0fef105` confirmaron que JDK 21 no
  aporta una API estándar completa para `SCM_RIGHTS`; no se fingirá el handoff
  mediante paths ni JNA dentro de Spring.
- El diseño elige un workspace Rust standalone: daemon root-owned y helper
  cliente root-owned ejecutado sin privilegios. Kotlin usa un adapter de
  infrastructure y conserva el puerto `MediaByteNormalizer`.
- PID 1, no un namespace privado del broker, será dueño de las unidades `.mount`
  transitorias por job vía D-Bus. Esas unidades no son templates y el cliente no
  proporciona nombres, paths, comandos ni properties.
- `003B-4B` queda dividido en 4B-1..4B-4. El primer corte sólo prueba
  codec/transporte/FD/snapshot en Linux sin root; no instala servicio, no monta,
  no integra Spring y no habilita `Ready`.

## 2026-11-20 — 003B-4A integrado; 003B-4B/4C permanecen abiertos

- PR #313 head `649f11242b47eca59ef28b9d87febfa85f3acab3` pasó tests focales
  23/23, Verify `44814135015` 5/5 y dos reviews independientes GPT-6.1 Sol
  sin P0–P3. Los dictámenes persistidos son
  `sdd/reviews/20261120-sol-pr313-security.md` y
  `sdd/reviews/20261120-sol-pr313-architecture.md`. Merge
  `d824e0751010a5f3a5f7e3522329832f02018bd6`.
- El primer intento posmerge `44816056376` falló antes de compilar un job por
  HTTP 429 de Maven Central. El rerun del mismo SHA terminó 5/5 verde, incluido
  `productive-routes-real-e2e`; no hubo cambio de código para ocultar el fallo.
- Este resultado cierra sólo `003B-4A`. El workspace privado sigue
  intencionalmente incompatible con el UID dedicado y la capability no devuelve
  `Ready`.
- El residual aprobado se divide en `003B-4B` (broker Linux root-owned,
  autenticación kernel, snapshot sellado cross-UID, cuotas por job/globales,
  runtime versionado y reconciliación) y `003B-4C` (harness Linux UID A/UID B
  con cgroup/mount/quota/fallos/reinicio reales). Ambos siguen sin implementar.
- Dos revisiones SDD detectaron cuatro P2 en el primer borrador: autoridad del
  socket/job, seal vulnerable a FD/mmap previos, Java sin execute y falta de
  presupuesto global. El contrato fue corregido y ambas re-reviews dieron
  `APPROVE` sin P0–P3. Es aprobación de diseño, no evidencia de runtime.

## 2026-11-20 — MEDIA-NORMALIZE-003B-4 en implementación

- `MEDIA-NORMALIZE-003B-3` quedó cerrada por PR #310: head `f6bb3a3`, Verify
  `44801937465` 5/5, dos reviews exact-head y merge `28b99b7`. Post-merge
  Verify `44804049350` 5/5.
- Este corte agrega `MediaWorkerCapability` cerrado (`Ready`/`Unavailable`/
  `Unknown`), `LinuxMediaWorkerIsolationAttestor`, `SystemdMediaWorkerLauncher`
  y `MediaWorkerCapabilityFactory`. `Ready` sólo sale de un aislamiento Linux
  cgroup v2 atestado más SELF_TEST `Matched` dentro de `systemd-run`. No hay
  fallback a `java` vía ProcessBuilder. Windows queda `Unavailable`.
- Sin HTTP, Spring bean de upload, secretos, deploy ni homologación.

## 2026-11-20 — MEDIA-NORMALIZE-003B-3 implementado, gate abierto

- El protocolo V1 agrega la operación cerrada `SELF_TEST(2)` sin cambiar el
  framing ni los codecs de `NORMALIZE(1)`. El challenge contiene UUID y nonce
  de 256 bits; `WorkerMain` conserva cero argumentos y escribe `result.bin`
  con `CREATE_NEW`/`NOFOLLOW`, sin crear output.
- El reporte offline toma SHA-256 del jar realmente ejecutado mediante
  `ProtectionDomain/CodeSource`. Un jar empaquetado válido es autoritativo; la
  propiedad documentada `storecore.media.worker.jar` sólo cubre tests in-process
  cuando CodeSource no es un jar, y exige estructura ZIP con entradas. Ruta
  ausente, directorio, symlink, no-jar o propiedad distinta del CodeSource
  empaquetado falla cerrado (`Unavailable`). Incluye vendor y versión Java exactos, plataforma cerrada
  (Linux amd64/arm64 y Windows amd64 sólo para prueba), inventario exacto de
  nueve dependencias runtime, módulos TwelveMonkeys `3.15.3`, providers
  ImageIO, fingerprint de `IMAGE_IO_V1` y hashes del corpus built-in.
- `MediaWorkerAttestationEvaluator` sólo retorna `Matched`, `Unavailable` o
  `Unknown`; drift o datos desconocidos quedan `Unavailable`. Nonces y todos
  los digests se comparan mediante `MessageDigest.isEqual`. No existe resultado
  `Ready`: pertenece exclusivamente a `MEDIA-NORMALIZE-003B-4`.
- El backend CI conserva `mvn -B verify` y después ejecuta el fat jar con
  `java -jar` sobre un workspace temporal `SELF_TEST`. Evidencia local:
  `mvn -B test` inicialmente 30 tests, 0 failures/errors y 1 skip de symlink;
  el fat jar devolvió exit 0 y `result.bin` no vacío. La evidencia final se
  actualizará tras el verify completo del candidato.
- `MEDIA-NORMALIZE-003B-2` quedó cerrada por PR #309: head `b41fc7e`, Verify
  #837 5/5, dos reviews exact-head y merge `17aadc8`.
  `MEDIA-NORMALIZE-003B-3` quedó cerrada por PR #310. `003B-4`, `003B`, `003`,
  `004` y TASK-005 siguen abiertos.

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

## 2026-11-20 — 003B-4 corregido tras reviews preliminares

- PR #313 permanece abierto y sin autorización de merge. Las dos reviews
  GPT-6.1 Sol del head `9c996d259859e4931ce13738c3624e4e592820cf`
  detectaron cuatro bloqueos: unidad systemd huérfana, workspace 0700
  incompatible con el UID dedicado, expectativa runtime auto-derivada del
  reporte y metadata Kotlin ficticia.
- La corrección local asigna unidad systemd propia, deadlines administrados,
  kill/stop y verificación terminal con `systemctl` atestado. Si la terminación
  no se prueba, el launcher queda cerrado, el workspace se retiene y no se
  libera admisión.
- `PrivateMediaWorkerWorkspace` conserva 0700/0600 y declara `Unavailable` para
  el principal dedicado. Por lo tanto este adapter no finge `Ready`; el handoff
  cross-UID real sigue siendo un corte posterior explícito.
- La expectativa Java es un `ApprovedMediaWorkerRuntime` independiente del
  SELF_TEST. Las pruebas negativas cubren drift de vendor, versión, OS y
  arquitectura.
- El worker empaqueta `META-INF/storecore/media-worker-runtime.properties` con
  nueve dependencias cerradas. La factory lo lee del JAR real; Kotlin ya no
  depende de un `pom.properties` inexistente.
- Evidencia local previa al SHA candidato: backend focal `30/30`; worker `36`
  ejecutados, `0` fallos y `2` skips de plataforma + IT del JAR `1/1`; factory
  contra el JAR sombreado real `1/1`. La suite backend completa alcanzó `547`
  tests con `0` failures y `218` errores de infraestructura por Docker local
  ausente (`20` skips), por lo que la evidencia PostgreSQL queda para CI.
  Falta congelar SHA, CI alojado y repetir ambas reviews exact-head antes de
  marcar `MEDIA-NORMALIZE-003B-4` como completado.

- La revisión del candidato `767d4c19fed759930bf8e47611d60efa3f0d8ee7`
  detectó un P2 adicional: si la retención insegura fallaba o lanzaba una
  excepción, `use` todavía podía cerrar y borrar un workspace cuyo proceso no
  tenía terminación confirmada. El flujo ya inhibe `close` antes de intentar
  la retención, bloquea permanentemente nuevas admisiones en normalización y
  mantiene la entrada activa si el movimiento a cuarentena no puede probarse.
- Evidencia focal posterior: `23/23` pruebas verdes para normalizador,
  capability factory y workspace privado, incluyendo retención
  `Unavailable`, `Unknown` y excepción. Esta evidencia tampoco autoriza el
  merge: el próximo commit vuelve a requerir CI y dos reviews independientes
  sobre su SHA exacto.

## 2026-11-20 — 003B-4B-1 en implementación

- El post-merge de PR #315 quedó confirmado en el SHA
  `e0fef1054f8629b8b51a6fd03e5a47b6726d36ab`: Verify `44821934780`
  terminó 5/5. Ese PR sólo documentó y aprobó el corte implementable; no cerró
  4B ni 4C.
- El primer corte sin privilegios vive en
  `feat/media-isolation-broker-contract-20261120`. Agrega un crate Rust
  separado con toolchain 1.100.0, lockfile real, dependencias/features exactas,
  formato/lints/tests Linux, revisión de licencias, SBOM CycloneDX y gate CVE.
- El wire v1 es binario y de longitud fija, con tipos cerrados Kotlin/Rust,
  `Unknown` sólo en el traductor y rechazo fail-closed en el borde. Ambas
  implementaciones consumen los mismos golden vectors.
- El transporte valida `SO_PEERCRED`, acepta exactamente un `SCM_RIGHTS`,
  rechaza truncamiento/ancillary inesperado y conserva la propiedad del FD en
  un objeto dedicado. El snapshot duplica el FD recibido, exige archivo
  regular, crea destino 0400 con `create_new`, limita bytes, verifica SHA-256 y
  tamaño, sincroniza y borra parciales ante fallo.
- Evidencia local hasta ahora: test Kotlin focal verde; `Cargo.lock` generado
  por Cargo 1.100; metadata y 16 licencias revisadas; `cargo fmt` verde;
  `cargo check --all-targets` y `cargo clippy -D warnings` verdes contra
  `x86_64-unknown-linux-gnu`. Los tests Linux ejecutables, SBOM/CVE y reviews
  exact-head quedan pendientes de CI alojado; por eso `003B-4B-1` sigue
  abierto y no habilita root, mount, D-Bus, wiring Spring ni `Ready`.
- Las tres reviews independientes del primer candidato
  `f3dba8f083b316ec10b241eeb48fbdb5918f1322` devolvieron REQUEST_CHANGES con
  tres P2 coincidentes: descriptores sin `CLOEXEC`, rango wire `u64` no
  representable por Kotlin y ausencia de fingerprint de metadata fuente
  antes/después del snapshot. El CI general de ese SHA se canceló para no
  consumir recursos; sólo el job `media-broker` había terminado verde.
- La corrección usa `CMSG_CLOEXEC` y `F_DUPFD_CLOEXEC`, prueba flag y no
  herencia tras `exec`, limita revisión a `1..Long.MAX_VALUE` con vectores
  compartidos de frontera, usa `pread` para no compartir offset y compara
  identidad, owner, modo, links, tamaño, mtime y ctime del FD antes/después.
  Una mutación determinista durante copia devuelve `SourceChanged` y elimina
  el parcial. El próximo SHA requiere nuevamente CI completo y reviews
  exact-head; los dictámenes del candidato anterior no lo aprueban.

## 2026-11-20 — 003B-4B-1 integrado con evidencia exacta

- El candidato corregido `be7b822581aff1f7c26463c938e6eef35fe81c02`
  pasó Verify `44826977557` 6/6. El job `media-broker` ejecutó 14 pruebas
  Rust en Linux, revisó 16 licencias, generó el SBOM CycloneDX y no detectó
  vulnerabilidades HIGH/CRITICAL. Backend, frontend, higiene y ambas matrices
  reales también quedaron verdes.
- Tres reviews exact-head independientes (bug/arquitectura, arquitectura y
  seguridad) aprobaron sin P0–P3. Revalidaron `CMSG_CLOEXEC`/
  `F_DUPFD_CLOEXEC`, el rango wire común `1..Long.MAX_VALUE` y el snapshot con
  `pread`, fingerprint antes/después y limpieza del parcial ante mutación.
- PR #316 fue fusionado en `master` mediante
  `df13f2dda89440a77bd7bcec7b48f1b1c139fe25`. El Verify post-merge
  `44828593553` terminó 6/6 sobre ese SHA.
- Se cierra exclusivamente `003B-4B-1`. Permanecen abiertos `003B-4B-2..4`,
  el agregado `003B-4B`, `003B-4C`, `MEDIA-NORMALIZE-003B-4`, TASK-005 e issue
  #7. Este corte no autoriza daemon root, mounts, D-Bus, wiring Spring ni
  capability `Ready`.

## 2026-11-20 — 003B-4B-1 documentado; 003B-4B-2 en implementación

- PR documental #317 head `ebee63611c26238c945ce1e75a977c090a635372`
  registró exclusivamente el cierre de 4B-1. Pasó Verify `44830331207` 6/6,
  fue fusionado mediante `444afd374e00c1416eeb72bbf412e184cfdfec0b` y
  su post-merge `44831963810` terminó 6/6.
- La rama `feat/media-broker-durable-state-20261120` implementa el alcance
  puro de 4B-2: estados cerrados y transiciones monotónicas, binding durable
  de job/principal/boot-id, CAS por revisión y presupuestos agregados de jobs,
  mounts, bytes, inodos y cuarentena. Trabajo terminal sin ACK conserva su
  reserva.
- El journal v1 es binario, de longitud fija y checksum SHA-256. Abre un
  directorio privado con `NOFOLLOW`, deriva nombres desde `JobId`, exige owner,
  modo, archivo regular y un solo hardlink, y persiste mediante
  `create_new`/file-fsync/rename/dir-fsync. Entrada desconocida, temporal de
  crash, checksum, versión, estado o metadata inválidos fallan cerrados.
- La reconciliación recibe un inventario exacto mediante un adapter testeable.
  Termina runtimes esperados tras reinicio; huérfanos, duplicados, estados
  desconocidos, ausencia inesperada o terminación no verificable bloquean
  admisión y retienen/cuarentenan evidencia cuando corresponde.
- Evidencia local previa al SHA candidato: `cargo fmt` verde y
  `cargo check --all-targets`/`cargo clippy -D warnings` verdes contra
  `x86_64-unknown-linux-gnu` con Rust 1.100 GNU. Los tests ejecutables Linux,
  CI completo y reviews exact-head siguen pendientes; por eso 4B-2, 4B, 4C,
  TASK-005 e issue #7 continúan abiertos. No existe daemon, mount, D-Bus,
  wiring Spring ni capability `Ready` en este corte.
- Las tres reviews exact-head del primer candidato
  `6dca213d9f3307920154fa47ef63b87137e76413` devolvieron REQUEST_CHANGES con
  cuatro P2 convergentes: journal sin escritor exclusivo, admisión abierta
  antes de reconciliar y tras cuarentena durable, transiciones públicas
  permitidas con el gate bloqueado, y apertura bloqueante de un FIFO con nombre
  `.job` válido. El job Linux de ese SHA ejecutó 32 tests y quedó verde, pero
  no cubría esos escenarios y por ello no autoriza merge.
- La corrección mantiene un `flock` exclusivo durante toda la vida del journal,
  abre entradas con `NONBLOCK`, introduce `RecoveryPending` y sólo habilita
  admisión al terminar una reconciliación limpia. Cuarentena durable,
  transición inválida/`Unknown` y commit incierto conservan el gate cerrado.
  Las pruebas nuevas cubren doble store, FIFO, restart pendiente, cuarentena
  tras restart y fallo inyectado después de `rename` antes de dir-fsync. El
  siguiente SHA vuelve a requerir CI completo y las tres reviews exact-head.
- El segundo candidato exact-head
  `4a10f15b8164d978f5f74e18a7c374e1f2cab1fa` ejecutó 40 tests Linux verdes
  en el job broker de Verify `44835298978`, pero las tres reviews independientes
  volvieron a rechazarlo con dos P2 convergentes: la precondición
  `RecoveryPending` se comprobaba después de efectos del adapter y un huérfano
  sin `JobRecord` sólo bloqueaba RAM, por lo que un reinicio con inventario vacío
  podía reabrir admisión. Ese SHA tampoco autoriza merge.
- La corrección en curso mueve la precondición antes de enumerar el runtime y
  agrega un latch global `admission.blocked`, binario, checksummed, persistido
  con file-fsync/rename/dir-fsync y una razón cerrada traducida una sola vez en
  el borde. Discrepancias, inventario no verificable y transición pública
  inválida requieren intervención aun después de reiniciar; no existe operación
  normal que elimine el latch. Las pruebas agregadas cubren rechazo antes de
  cualquier efecto del adapter, huérfano activo que sigue bloqueado tras un
  reinicio con inventario limpio y rechazo de una razón wire desconocida.
  `cargo fmt`, `cargo check --all-targets` y `cargo clippy -D warnings` están
  verdes localmente para `x86_64-unknown-linux-gnu`; CI exact-head y tres nuevas
  aprobaciones siguen pendientes, por lo que `003B-4B-2` permanece abierto.
- Las tres reviews exact-head del tercer candidato
  `d3fa5f8c41b7cbb67db4c97856c8ef5985694ff8` convergieron en otro P2 de
  ordering: el latch se escribía en `finish_reconciliation`, después de poder
  terminar un huérfano o runtime inesperado. Un crash entre el efecto externo
  y el latch podía consumir la evidencia. El job broker de Verify
  `44836626734` pasó 44 tests, licencias y CVEs, pero el workflow se canceló
  tras el rechazo para ahorrar recursos; ese SHA no autoriza merge.
- La corrección en curso separa persistir la intención de bloquear de cerrar la
  admisión: ante cada mismatch, acredita primero el latch durable mientras el
  store sigue en `RecoveryPending`, y sólo después permite terminación o
  cuarentena. Si crear el latch falla, no se invoca el adapter. Las regresiones
  simulan un crash en la frontera de terminación y un fallo anterior a crear el
  marker; el reinicio permanece bloqueado en el primer caso y no ocurre el
  efecto externo en el segundo. Este nuevo candidato vuelve a requerir CI 6/6
  y tres aprobaciones exact-head; 4B-2 continúa abierto hasta entonces.

## 2026-11-20 — 003B-4B-2 implementado y verificado

- El candidato final `9e77bcf8de7b2a874d0998cd43435f999050f85b`
  persiste la intención durable antes de cualquier terminación o cuarentena que
  pueda consumir evidencia. `RecoveryPending` permite completar sólo la
  remediación interna; allocation y transición pública permanecen cerradas. Si
  el latch no puede acreditarse, el adapter no recibe el efecto.
- Verify exact-head `44837144576` terminó 6/6. El job `media-broker`
  `136636396565` pasó 46 tests Linux, fmt/clippy, 16 licencias y el gate sin
  HIGH/CRITICAL. Las tres reviews independientes GPT-6.1 Sol de
  bug/arquitectura, arquitectura y seguridad aprobaron el SHA exacto sin
  hallazgos P0–P3.
- PR #319 fue fusionado en `master` mediante
  `381296d6e267d4c2813345f3bb635ad927a1aff5`. El Verify post-merge
  `44838436904` terminó 6/6 sobre ese merge commit.
- Se cierra exclusivamente `003B-4B-2`. Permanecen abiertos `003B-4B-3`,
  `003B-4B-4`, el agregado `003B-4B`, `003B-4C`,
  `MEDIA-NORMALIZE-003B-4`, TASK-005 e issue #7. Este corte no acredita daemon
  privilegiado, mounts, D-Bus, wiring Spring ni capability `Ready`.

## 2026-11-20 — 003B-4B-3A en implementación

- El corte `003B-4B-3` se divide sin reducir sus criterios: `3A` define la
  política cerrada y la attestación del runtime; `3B` implementará el adapter
  D-Bus allowlisted; `3C` conectará daemon, efectos y reconciliación. Ningún
  subcorte aislado cierra `4B-3` ni habilita `Ready`.
- La implementación candidata deriva workspace, unidad `.mount`, unidad worker,
  opciones tmpfs, comando, entorno y límites sólo desde `JobId`, un
  `MediaIsolationProfileId` conocido y política compilada por el broker. El
  cliente no aporta paths, nombres, comandos ni propiedades systemd.
- `ApprovedRuntime` fija las rutas versionadas de Java/JAR y exige evidencia
  root-owned, sin symlinks, modos `0555`/`0444` y digest exacto. Evidencia
  ausente, `Unknown`, de tipo distinto, escribible o con digest diferente falla
  cerrada.
- `rustfmt` y una compilación de metadata Rust 1.100 del módulo y sus tipos
  dependientes pasan localmente. Clippy y tests Linux exact-head siguen
  pendientes del CI; por eso `003B-4B-3A`, `003B-4B-3`, `003B-4B`, `4C`,
  TASK-005 e issue #7 permanecen abiertos.
