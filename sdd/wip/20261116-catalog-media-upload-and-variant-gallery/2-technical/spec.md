# Especificación técnica — media de catálogo y galería por variante

## Baseline y decisión

El baseline ya posee `product_images(product_id,url,sort_order,is_primary)` y
la proyección `CatalogMedia`, pero no tiene upload, ownership del objeto ni
vínculo por variante. El endpoint histórico propuesto `/api/v1/admin/media` se
reemplaza por la frontera USER vigente; no se crea un segundo realm admin.

La feature es single-tenant por instalación. No restaura `store_id` ni toma
DDL del WIP multi-tenant supersedido.

## Dominio cerrado

Kotlin usa `enum`/`sealed class`; Angular usa clases con constructor privado,
instancias estáticas y un único `fromWire` en el mapper de borde.

- `MediaAssetState`: `AwaitingBytes`, `StoredPrivate`, `Attached`,
  `DeletePending`, `Deleted`, `Failed`, `Unknown`.
- `MediaFormat`: `Jpeg`, `Png`, `Webp`, `Unknown`.
- `MediaProviderKind`: `Unconfigured`, `TestStub`, `Cloudinary`, `Unknown`.
- `MediaAssociationKind`: `ProductGallery`, `VariantGallery`, `Unknown`.
- `LegacyMediaState`: `Allowed`, `Blocked`, `Unknown`.
- `MediaUploadOutcome`: `Created`, `Replay`, `Rejected`, `Conflict`, `Failed`,
  `Unknown`.
- `MediaCommandState`, `MediaFailureCode`, `ObjectLookupOutcome` y
  `ObjectDeleteOutcome` son cerrados. Lookup distingue `Present`, `Absent`,
  `DigestMismatch`, `Unavailable`, `Unknown`; delete distingue `Deleted`,
  `AlreadyAbsent`, `RetryableFailure`, `TerminalFailure`, `Unknown`.

`MediaAssetId`, `CatalogMediaDraftId`, `UploadId`, `ContentDigest`,
`PixelDimensions`, `AltText`, `PublicMediaUrl` y `ManagedMediaPath` son value
objects. `PublicMediaUrl` cubre legacy HTTPS; `ManagedMediaPath` sólo construye
`/api/v1/catalog/media/{productImageId}` desde un ID validado. `PublicMediaUrl` acepta sólo HTTPS, host
allowlisted, sin userinfo, fragmento, controles, backslash o forma protocol
relative. El JSON entra por un traductor; `Unknown` nunca se publica.

Cada paso del flujo es un objeto con una responsabilidad:

1. `AuthorizeMediaUploadStep`
2. `InspectMediaBytesStep`
3. `NormalizeMediaStep`
4. `StoreMediaObjectStep`
5. `FinalizeMediaAssetStep`
6. `RecoverMediaUploadStep`

El recorrido los ordena; agregar otro proveedor no reescribe los pasos.

## Persistencia

Migración propuesta `V27__catalog_media_assets.sql` sobre la base aprobada en
`41948a6`, donde V24–V26 pertenecen al option schema. Antes de implementar se
vuelve a calcular el próximo número libre contra `master`; nunca se reutiliza,
renombra ni modifica una migración publicada:

- `catalog_media_drafts`: id UUID, owner_user_id, target_product_id nullable,
  estado, revisión positiva, created_at y expires_at. Un draft de alta se reclama
  una vez al crear producto; uno de edición queda ligado al producto.
- `media_assets`: id UUID/opaque, draft_id y owner_user_id inmutables, upload_id
  único dentro del draft, original_sha256, normalized_sha256, format, width,
  height, normalized_size, state cerrado, provider_kind, provider_key cifrado o
  referencia opaca no pública, failure_code cerrado, created_by,
  created_at, updated_at, delete_requested_at. No persiste URL pública del
  proveedor; un asset siempre conserva delivery privado.
- evolucionar `product_images`: agregar `media_asset_id` FK nullable durante la
  compatibilidad, `source_kind` cerrado (`LEGACY_URL`/`MANAGED`) y `alt_text`;
  reemplazar el check/NOT NULL de URL por ramas exclusivas: `LEGACY_URL` exige
  URL HTTPS y asset null; `MANAGED` exige asset y URL null. El mapper construye
  `ManagedMediaPath`, nunca lo persiste como URL/input del usuario. Ambas ramas
  y `variant_images` conservan `sort_order >= 0`.
- upgrade legacy ordena por `(sort_order,id)`, preserva portada válida o elige la
  primera cuando falta, resuelve empates sin truncar galerías >20 y backfillea
  alt no vacío desde nombre recortado a 180 caracteres con fallback estable.
- `variant_images`: variant_id, product_image_id, sort_order, is_primary;
  FK compuesta/trigger validado garantiza que variante e imagen pertenecen al
  mismo producto. Índices únicos garantizan orden y una portada por variante.
- `media_upload_commands`: draft_id, owner_user_id, upload_id, original_hash,
  normalized_hash, asset_id, deterministic_key, state, lease_owner, lease_until,
  fence_version, result y timestamps para replay/conflicto durable.

La revisión media vive en un padre durable aunque la galería esté vacía. Un
único comando CAS reemplaza asociaciones y escribe auditoría redacted dentro de la misma
transacción. No se sostiene una transacción PostgreSQL durante I/O externo.

Attach, publish, delete y GC toman locks compatibles sobre asset/draft/producto.
Un asset en vuelo no se borra; uno reclamado para delete no se adjunta. Los
constraints garantizan exactamente una portada cuando la galería no está vacía,
no sólo como máximo una.

## Upload y consistencia externa

`MediaObjectStore` es un puerto de aplicación:

- `putIfAbsent(normalizedBytes, deterministicKey, digest, metadata): PutOutcome`
- `head(deterministicKey): ObjectLookupOutcome`
- `signedPrivateRead(providerKey, digest, ttl): PrivateReadOutcome`
- `deleteIfDigest(providerKey, digest): ObjectDeleteOutcome`

`TestMediaObjectStore` sólo existe bajo perfil de test y no sirve bytes en
producción. `CloudinaryMediaObjectStore` es condicional a configuración válida;
modo predeterminado `UNCONFIGURED` falla cerrado.

Secuencia durable:

1. Se autentica, autoriza y valida CSRF antes del I/O externo; los bytes se
   spolean en un temporal acotado y se normalizan de forma determinista.
2. Tx-A, mediante `IdentityMutationCoordinator`, registra scope draft/actor/
   producto, ambos hashes, metadatos, assetId/key y `AWAITING_BYTES`; rota CSRF
   una sola vez y devuelve el token nuevo si la respuesta llega.
3. Fuera de transacción un claimant toma lease con fencing y usa `putIfAbsent`;
   nunca sobrescribe una key ni borra sin digest exacto.
4. Fuera de transacción se ejecuta `head`; Tx-B toma lock, vuelve a verificar
   fence/scope/key/digest contra ese resultado y marca `STORED_PRIVATE` sin I/O
   remoto bajo la transacción.
5. Caída antes del put deja `AwaitingBytes`: luego de resincronizar sesión/CSRF,
   el cliente reenvía mismo uploadId/bytes. Caída después del put se recupera por
   `head`. Un claimant vencido no confirma ni borra trabajo de otro.

El request hash cubre scope, metadatos y digest original; el digest normalizado
identifica el objeto. GET por uploadId es read-only y permite recuperar aunque
se pierdan assetId y CSRF de la respuesta. La UI rehidrata sesión USER antes de
otro retry mutante.

Scope se evalúa en dos fronteras: staging exige actor+draft+target; después del
claim, la asociación pertenece al producto y cualquier ADMIN con MANAGE puede
mantenerla desde otro draft. El segundo ADMIN no obtiene preview ni bytes de
staging del primero. Se prueba reordenar una foto publicada por ADMIN B y agregar
una nueva propia sin cruzar staging.

Los objetos nunca se promueven a públicos. `GET
/api/v1/catalog/media/{productImageId}` verifica en cada request que la
asociación siga publicada, que producto/variante estén activos y que el asset
sea privado válido y que `STOREFRONT/SERVE` permita servir; recién entonces pide una URL firmada de lectura con TTL
máximo 60 s o hace streaming acotado. La respuesta no se cachea más allá de ese
TTL. La ruta y cualquier redirect StoreCore usan `Cache-Control: no-store`; el
destino firmado no cachea más allá del vencimiento absoluto restante.
Unpublish, pausa explícita de delivery, `STOREFRONT/SERVE` o desactivación corta
nuevas firmas; las ya emitidas vencen dentro
del límite explícito.

El borrado usa `DELETE_PENDING`; sólo un worker técnico fuera de la transacción
llama al proveedor y luego marca `DELETED`. Rechazo/timeout conserva estado para
reintento. Nunca se marca borrado por ACK del frontend. Workers revalidan
capability/kill switch y scope técnico, pero no reutilizan CSRF humano. Revocar
ADMIN impide comandos nuevos; un comando previo sólo completa compensación
segura, no publicación posterior.

## Subcorte TASK-003: expiración y limpieza durable de drafts

Un puerto separado de mantenimiento expira únicamente drafts `OPEN` cuyo
`expires_at` venció según `clock_timestamp()` de PostgreSQL. Cada lote acepta
entre 1 y 100 elementos. La expiración y el registro de GC son transacciones
cortas separadas: un reinicio entre ambas recupera assets de drafts `EXPIRED`,
`ABANDONED` o `CLAIMED` sin borrar drafts, assets ni comandos históricos.
El worker no obtiene locks de producto y nunca adquiere draft después de asset.

El barrido toma assets en orden UUID con `SKIP LOCKED`, luego upload y delete.
Revalida el estado cerrado del draft, la ausencia de `product_images` y un
estado de asset elegible. Una lease upload viva posterga el asset; cuando vence,
el barrido incrementa fence y limpia lease antes de registrar `ORPHAN_GC` en
V28. Assets `ATTACHED`, referenciados, ya pendientes o borrados se preservan.
No hay I/O remoto en estas transacciones; el worker delete existente ejecuta y
reconcilia tombstones, incluido un put tardío. Claims upload nuevos toman lock
draft antes de asset y fallan cerrados si el draft está cerrado o vencido.
V29 agrega índices parciales globales `(expires_at,id) WHERE state='OPEN'` y
assets UUID en estados candidatos, para excluir historial retenido del barrido;
V27/V28 permanecen inmutables. `CLAIMED` de draft es el claim final y atómico
de alta, no una lease upload: sus referencias publicadas siempre se preservan.

## Inspección y normalización

- un `OncePerRequestFilter` anterior al `DispatcherServlet` valida Origin,
  envelope de sesión, Content-Length y reserva cuota global/actor antes de que
  Spring resuelva multipart; chunked excedido se corta por contador de stream
- límite multipart total, una sola parte file y longitudes de campos/headers
- límite de request en proxy y Spring, streaming con contador y directorio
  temporal dedicado no ejecutable
- detección por magic bytes y decoder real; no confiar en extensión/MIME
- decoder con límites de dimensiones/píxeles antes de reservar buffers grandes
- rechazar SVG, animación, múltiples frames, contenido no decodificable y datos
  adicionales peligrosos
- corregir EXIF orientation, eliminar EXIF/XMP/ICC no necesario y re-encodear a
  formato permitido; calcular digest sobre bytes normalizados
- límites de duración decode/encode, salida, memoria y concurrencia; cuota
  durable por actor/draft para staging y comandos huérfanos
- temporales opacos con permisos mínimos y barrido selectivo al iniciar; SIGKILL
  sólo deja archivos dentro de ese directorio dedicado
- nombre original sólo se usa como texto de auditoría redactado o se descarta;
  nunca forma paths, keys o headers

La librería concreta de decode/encode debe elegirse en implementación mediante
ADR y revisión de CVEs/licencia; el spec no fuerza una dependencia sin evaluar.

### Subcorte MEDIA-NORMALIZE-001/002 — contrato y framing estructural

ADR-001 selecciona un helper JVM aislado y un perfil versionado, pero no lo
activa. Dominio y aplicación exponen límites numéricos inmutables, perfil y
rechazos cerrados, decisiones de dimensión fail-closed y un puerto que entrega
un artefacto temporal opaco. `Unknown`/`Unavailable` nunca producen bytes
aceptados. Un parser puro acotado valida framing JPEG/PNG/WebP, EOF exacto,
animación, dimensiones, segmentos y metadata antes del futuro decoder. El corte
no implementa decoder, proceso, multipart, HTTP, persistencia ni proveedor.

### Residual MEDIA-NORMALIZE-003B-4 — aislamiento Linux verificable

`003B-4A` aporta factory y lifecycle fail-closed, pero el workspace privado
backend-only no es consumible por el UID dedicado y por ello nunca acredita
`Ready`. `003B-4B` agrega un broker local root-owned con protocolo cerrado,
socket protegido autenticado por `SO_PEERCRED`, binding durable
principal/job/revisión, handoff cross-UID y un `tmpfs` por job con cuota de bytes
e inodos. La admisión reserva además presupuestos globales de jobs, mounts y
cuarentena. El backend no recibe autoridad genérica sobre systemd ni puede
elegir comandos, paths o límites. El broker deriva todo desde un perfil
root-owned, crea un snapshot nuevo broker-owned para sellar el input y
reconcilia durablemente units/mounts tras reinicio. Java y worker provienen de
una instalación root-owned versionada, sin symlinks, con ejecutables `0555`,
jar/datos `0444` y digest aprobado.

Los estados del broker, resultados de handoff y attestación son tipos cerrados;
un wire desconocido se traduce una sola vez a `Unknown` y bloquea admisión. La
attestación lee propiedades efectivas y cgroup v2, incluida la cuota/mount real,
en vez de repetir los valores solicitados. El output sólo se acepta tras estado
terminal verificado y validación de owner, modo, tamaño y digest. Fallos de kill,
unmount o reconciliación retienen workspace/evidencia y cierran el gate global.

`003B-4C` ejecuta un harness Linux real con backend UID A y worker UID B. Debe
probar SELF_TEST/NORMALIZE, aislamiento entre jobs, cuota por job y global,
terminales sin ACK, FD/mmap conservados tras el seal, OOM/timeout, terminación
del cgroup, rechazo de sustitución y recuperación por reinicio en cada
transición durable. Mocks, ejecución directa del jar o ambos procesos con el
mismo UID no satisfacen el gate. Sólo `003B-4A+4B+4C` permiten completar
`003B-4`; HTTP, multipart y proveedor live siguen fuera de este residual.

## HTTP

- `POST /api/v1/user/catalog/media-drafts`: draft de alta/edición con target
  opcional; ADMIN, CSRF y MANAGE.
- `GET /api/v1/user/catalog/media-capability`: ADMIN; disponibilidad y límites
  tipados, no-store.
- `POST /api/v1/user/catalog/media-drafts/{draftId}/uploads` multipart
  (`uploadId`, `file`): ADMIN owner, mismo origen, USER CSRF,
  `CATALOG/MANAGE`, no-store. Devuelve DTO seguro y CSRF rotado.
- `GET /api/v1/user/catalog/media-drafts/{draftId}/uploads/{uploadId}`: ADMIN
  owner, read-only; recuperación sin provider internals.
- `GET /api/v1/user/catalog/media/{assetId}/preview`: ADMIN owner, same-origin,
  no-store; bytes privados con headers estrictos.
- `GET /api/v1/user/catalog/products/{sku}/media/{productImageId}/preview`:
  ADMIN/OPERATOR con READ sobre el producto, incluso DRAFT/ARCHIVED; permite que
  otro ADMIN mantenga la asociación sin leer staging ajeno.
- `DELETE /api/v1/user/catalog/media/{assetId}`: ADMIN owner, CSRF y MANAGE;
  sólo sin referencias, devuelve estado autoritativo.
- `GET /api/v1/user/catalog/products/{sku}/media`: ADMIN/OPERATOR con READ;
  composición completa, IDs y `mediaRevision` positiva.
- `PUT /api/v1/user/catalog/products/{sku}/media`: ADMIN, CSRF y MANAGE,
  `{draftId,expectedRevision,productImages[],variantImages[]}`; CAS atómico.
- `GET /api/v1/catalog/media/{productImageId}`: público sólo si la proyección
  autoritativa está activa; emite redirect firmado <=60 s o streaming seguro.

El endpoint de producto deja de aceptar URLs nuevas y omite media del comando
textual en edición: payload ausente/viejo jamás borra galerías. En alta, el
request agrega `mediaDraftId` y `clientVariantRef`; creación de producto,
variantes, claim y asociaciones ocurre en una transacción, sin segundo guardado
parcial. El hash del comando incluye SKU/draft/variantes/media: replay exacto
devuelve producto, IDs de variantes, composición y `mediaRevision`; reutilizar
el draft con otro producto/hash devuelve 409. Lectura legacy aprobada permanece;
legacy bloqueada sólo se expone a ADMIN con estado cerrado y en público usa
placeholder.
La migración escribe un marcador de compatibilidad media. Un interlock externo
obligatorio del deploy lo consulta antes de arrancar/admitir artefactos, drena
instancias previas y rechaza el binario anterior antes de tráfico o escritura;
no se confía en que ese artefacto conozca `source_kind` ni implemente read-only.
El gate se prueba con el artefacto anterior real y una DB migrada con media
managed, verificando que jamás ejecuta su DELETE+reinsert destructivo. Respuestas usan
`BaseResponse`, códigos cerrados, límites sin payload crudo y CSRF rotado por
`IdentityMutationCoordinator` cuando hay mutación local.

`413` cubre tamaño; `429` cuota/concurrencia con `Retry-After`; `400` validación;
`401/403` identidad/autoridad; `404`
ownership opaco; `409` replay con hash distinto, revisión stale o asset referido;
`422` bytes/formato rechazados; `503` proveedor no configurado/indisponible.

## Frontend Angular

`CatalogMediaRepository` es un puerto. El adapter HTTP traduce una vez y nunca
expone strings wire al store. `MediaUploadFlow` compone pasos para seleccionar,
validar UX, subir, recuperar y adjuntar. El editor mantiene:

- catálogo autoritativo publicado
- borrador de composición
- uploads locales por `uploadId`
- estado cerrado y generación de request vinculados al USER autenticado
- fence compuesto por USER + draftId + productId/SKU + generación de ruta

Logout/cambio de actor/pérdida de ADMIN cancela suscripciones, limpia archivos y
borradores sensibles e ignora callbacks tardíos. Sólo un upload por item y un
save de composición pueden estar activos; la cola visible es explícita. No se
conservan bytes en localStorage/IndexedDB.

Toda mutación USER entra en una cola global compatible con la rotación CSRF;
cambio de producto A→B invalida la generación anterior aun con el mismo ADMIN.
Respuestas tardías, recovery y uploads de A no alteran el draft de B.

Un componente `MediaGalleryEditor` reusable muestra dropzone accesible, progreso
en live region discreta, errores asociados al archivo, reintento y foco restaurado,
reordenamiento por teclado/botones además de drag, portada, alt text y
asociación por variante. La PDP consume `VariantMediaSelection`, un objeto que
recibe el resultado cerrado del `OptionSelectionEngine` y decide galería
específica o fallback general sin switches de strings. No vuelve a interpretar
el SKU de ruta ni completa una selección parcial: `Incomplete`, `Unknown` y
`Absent` multivariante **sin variante resuelta** producen galería general. Si
el motor ya resolvió una variante por selección explícita, intención restaurada
o `selectGeneric(SKU)`, usa su galería incluso bajo schema `Absent`; el caso
univariante conserva la autoelección del mismo motor.

El adapter público versiona el DTO para `productImageId`, portada, orden y alt.
Todos los consumidores actuales (`JdbcCatalogProjectionReader`, listado/home,
favoritos y contrato BlackStore) migran explícitamente y preservan legacy.
Carrito y `order_items.product_snapshot` no adquieren media variante en este
corte ni se usan como referencia para GC.

## Seguridad y privacidad

- secrets por referencia de ambiente/secret manager; jamás en repo, API, DOM,
  source maps, logs o artefactos CI
- allowlist de host y egress; timeouts, tamaño de respuesta y TLS verificado
- rate limit por actor/instalación y límites de uploads concurrentes
- audit sólo actor, assetId, digest abreviado, outcome y campos cambiados; no
  bytes, firma, URL firmada, provider key ni cuerpos de error externos
- ownership opaco y autorización repetida en recuperación/borrado/worker
- CSP `img-src` permite la ruta same-origin y, sólo si se redirige, el host/CDN
  firmado acordado; nunca `*`/`data:`
- URLs públicas no se consideran evidencia de ownership; la FK interna manda
- se valida host, namespace de cuenta/cloud y delivery type; host compartido no
  prueba pertenencia

## Observabilidad y operación

Métricas: upload accepted/rejected/failed, bytes normalizados, latencia provider,
pending age, delete retry, orphan count y composition conflicts. Logs estructurados
usan correlationId/uploadId/assetId y códigos cerrados. Alertas no incluyen URLs
ni nombres de archivo.

Kill switch de upload/delete impide esas mutaciones externas, pero mantiene
entrega y edición de asociaciones existentes cuando sea seguro. Delivery tiene
su operación/capability separada. Runbook cubre
provider outage, backlog pending, orphan cleanup, rotación de credenciales y
rollback. Rollback de aplicación no elimina DDL ni objetos.

## Verificación

- dominio: todos los estados/fromWire/Unknown, URL, dimensiones y transiciones
- seguridad de archivos: magic mismatch, polyglot, corrupto, animado, exceso de
  píxeles/tamaño, metadata removida y temporal eliminado
- PostgreSQL 16: clean/upgrade, replay/conflicto, CAS, constraints, marcador e
  interlock externo probado con artefacto anterior, rollback,
  crash antes/después de Tx-A/put/Tx-B, lease/fencing, attach/delete/GC
  concurrente, worker delete, draft claim y ownership cruzado
- upgrade desde filas V1 legales: sin portada, sort_order repetido, nombre de
  200 caracteres y galería >20 preservada/read-only hasta normalización
- HTTP: matriz de roles, CSRF/origin, capability, no-store y errores cerrados
- Angular: mapper/store/carreras/logout, upload recovery, edición, teclado,
  accesibilidad y responsive
- browser real: upload stub aislado → composición → reload → PDP variante →
  fallback → intención restaurada → desvincular/borrar pendiente; preview
  anónima denegada, entrega sólo tras asociación activa, CAS fallido/inactivo
  denegados y URL firmada expirada tras el TTL
- browser multi-actor: ADMIN A publica; ADMIN B reordena asociación publicada y
  previsualiza producto DRAFT, agrega desde su propio draft sin leer staging de
  A; navegación A→B descarta callbacks tardíos y conserva secuencia CSRF
- CI sin red externa para tests; adapter Cloudinary sólo contract-test con fake
  local. E2E real del proveedor requiere credenciales fuera del repo y GO aparte.

## Subcorte TASK-003/TASK-008: alta atómica local de catálogo

El alta usa un puerto separado `MediaProductCreationRepository`. Es
estrictamente create-only y no reutiliza `JdbcCatalogService.saveProduct`, que
es un upsert legacy y reemplaza galerías. El dominio recibe un comando validado
con nombre, slug, estado cerrado, precio ARS, variantes, stock inicial,
`clientVariantRef` y una composición formada únicamente por assets staged del
draft. Todos los campos mutables participan de una canonicalización binaria
versionada y de un SHA-256; no se hashea JSON cuya forma dependa del mapper.

La operación local completa una sola transacción `REQUIRED`: serializa el draft,
crea producto y variantes, inserta balances iniciales, bloquea assets por UUID y
sus comandos upload/delete, revalida `clock_timestamp()`, publica imágenes y
galerías, cambia assets/upload a `ATTACHED`, reclama `OPEN→CLAIMED`, escribe
auditoría y persiste el receipt. No llama object storage, HTTP ni otro proveedor.
Las variantes se insertan en orden SKU estable y los assets se bloquean por UUID.

V30 agrega un ledger durable único por draft. Ante una fila existente se toma
su lock antes del draft: mismo hash devuelve el snapshot persistido aunque el
draft ya esté CLAIMED o vencido; otro hash devuelve conflicto sin revelar datos.
Cuando no existe fila, se bloquea el draft y se consulta nuevamente el ledger
antes de insertar el claim transaccional, cerrando la carrera del caso ausente.
La fila sólo se hace visible junto con el agregado completo; cualquier fallo de
validación, unicidad, asociación, auditoría o receipt revierte todo. El snapshot
versionado contiene `productId`, mapa `clientVariantRef→variantId`, imágenes,
composición y `mediaRevision`; replay nunca reconstruye desde la proyección
actual. Versión, estado o forma desconocidos producen `Unknown` fail-closed.

El draft debe pertenecer al USER, estar OPEN, no tener target y no haber vencido.
Cada asset debe pertenecer al mismo USER/draft, estar `STORED_PRIVATE`, tener
upload `COMPLETED`, proveedor válido y ninguna orden delete. La expiración se
consulta con reloj PostgreSQL después de todos los locks y de cualquier espera
de unicidad. El orden global queda ledger existente → draft → producto nuevo →
variantes → assets UUID → upload → delete; cleanup nunca adquiere draft después
de asset y la creación nunca adquiere un lock de rango anterior después de asset.

Los errores de unicidad de slug/SKU se traducen fuera de la transacción abortada
a un conflicto cerrado. No se crea ni reutiliza una entidad parcial. El corte
mantiene single-tenant, USER/CUSTOMER separados y no habilita proveedor live.

## Decisiones pendientes antes de implementar adapter live

- cuenta y plan Cloudinary titular
- regiones/hosts exactos y política CDN
- transformaciones/formato de salida y retención
- cuotas, costos, rate limits y soporte
- secret manager y rotación
- ambiente no productivo y procedimiento de homologación
- staging privado, lectura firmada/streaming y TTL/caché con garantías observables

Estas decisiones no bloquean revisar el dominio ni implementar el adapter de
prueba, pero sí bloquean activar `Cloudinary` y cerrar homologación.
