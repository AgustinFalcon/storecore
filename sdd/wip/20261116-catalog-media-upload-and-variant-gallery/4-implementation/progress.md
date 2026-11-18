# Progreso

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
