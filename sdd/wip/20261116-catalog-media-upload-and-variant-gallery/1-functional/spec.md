# Especificación funcional — media de catálogo y galería por variante

## Resultado de negocio

El equipo del comercio puede presentar productos con fotografías reales sin
copiar URLs manualmente. Desde el editor de catálogo, un ADMIN carga imágenes,
define el orden y la portada del producto y decide qué subconjunto corresponde
a cada variante. En el storefront, la galería cambia de forma predecible al
elegir una variante y conserva una alternativa accesible cuando esa variante no
tiene fotografías propias.

## Actores y autoridad

- `ADMIN`: carga, vincula, ordena, designa portada, desvincula y solicita borrado.
- `OPERATOR`: conserva lectura de catálogo; no administra media.
- `CUSTOMER` y visitante: sólo reciben media publicada de productos activos.
- StoreCore es autoridad de asociaciones, orden y visibilidad. El proveedor de
  objetos sólo almacena bytes y devuelve una referencia opaca.

Todos los roles y estados son tipos cerrados. Valores wire desconocidos se
traducen a `Unknown` y fallan cerrados; nunca se imprimen como estados válidos.

## Flujos

### Cargar una imagen

1. El ADMIN elige un archivo en el editor de producto.
2. La UI valida tipo y límite visible antes de enviar, sin presentarlo como
   validación de seguridad definitiva.
3. StoreCore valida sesión USER, rol ADMIN, capability `CATALOG/MANAGE`, mismo
   origen, CSRF e idempotencia.
4. El upload pertenece desde el primer comando a un borrador opaco del catálogo
   y al ADMIN creador. Para un producto existente el borrador queda ligado a su
   ID; para un alta, el borrador se crea antes de recibir archivos y se reclama
   atómicamente al crear el producto.
5. StoreCore inspecciona los bytes, normaliza la imagen y la almacena mediante
   el puerto configurado en un espacio no público.
6. La respuesta devuelve `assetId`, dimensiones, formato, tamaño y una ruta de
   preview same-origin autenticada. Nunca devuelve URL pública, public ID
   interno, firma, clave de gestión o credencial.
7. La UI mantiene el asset en staging hasta vincularlo. Los objetos permanecen
   privados siempre: StoreCore sólo habilita una ruta same-origin de entrega
   cuando el producto/asociación están publicados.

### Componer la galería

- El ADMIN agrega assets listos al producto, los reordena y elige exactamente
  una portada cuando la galería no está vacía.
- Una variante puede vincular cero, una o varias imágenes del mismo producto,
  con su propio orden y una portada de variante.
- Staging sólo puede consultarse o adjuntarse desde el mismo actor/draft. Una vez
  publicada, cualquier ADMIN autorizado del producto puede reordenar, editar alt
  o desvincular la asociación; no obtiene acceso al staging privado ajeno.
- Un GET ADMIN devuelve siempre la composición completa y `mediaRevision`
  positiva, incluso para galería vacía. Guardar usa esa revisión y es atómico
  respecto de asociaciones, orden, portada y auditoría. Un 409 permite recargar
  autoridad; la UI conserva el borrador y no lo pisa sin confirmación.
- El guardado textual general del producto preserva media legacy y administrada;
  sólo el comando de composición modifica asociaciones de media.
- En alta, el comando de creación incluye `mediaDraftId` y un `clientVariantRef`
  por variante. Producto, variantes, claim del draft y asociaciones se confirman
  en una sola transacción. Si falla, el producto no se publica parcialmente y
  el staging privado queda disponible para retry hasta su TTL.
- En edición, una variante nueva se guarda primero mediante el comando textual
  que preserva media; tras leer su ID autoritativo se la vincula por PUT media.
  Si falla, staging sigue privado; si sólo la variante quedó guardada, la UI lo
  informa y permite completar su foto sin rollback oculto.

### Experiencia storefront

- PDP consume la misma selección autoritativa y tipada que precio, stock e
  intención. Sólo usa media de variante cuando el option schema resuelve una
  variante: un SKU de ruta no se interpreta por separado en la galería.
  `Incomplete`, `Unknown` y `Absent` con múltiples variantes **sin variante
  resuelta** mantienen la galería general sin autocompletar prefijos ni elegir
  la primera variante. Si el motor resuelve una variante autoritativa mediante
  selección explícita, intención restaurada o `selectGeneric(SKU)`, se usa su
  galería aunque el schema sea `Absent`.
  `Absent` con exactamente una variante conserva la autoelección ya definida
  por el motor autoritativo. La imagen nunca crea una segunda selección.
- Al elegir/restaurar una variante con media propia, PDP reemplaza la galería
  por su conjunto exclusivo; portada es la marcada, no la primera por accidente.
  Cambiar galería no altera cantidad, precio ni intención.
- Si la variante no tiene media, PDP mantiene la galería general; no muestra
  una imagen rota ni reutiliza silenciosamente la media de otra variante.
- Al cambiar variante, ruta o recargar, la imagen activa se conserva sólo si su
  `productImageId` sigue en la nueva galería; si no, se activa la portada. Una
  imagen rota se omite por ID, sin bucles: prueba las restantes de esa variante,
  luego una vez la galería general excluyendo fallidas y finalmente un
  placeholder accesible sin miniaturas/controles muertos.
- Miniaturas, imagen activa, teclado y lectores de pantalla mantienen nombre,
  posición, foco visible y texto alternativo útil.
- Listado, home y favoritos usan la portada general publicada. Media específica
  de carrito y snapshots históricos de orden queda fuera de este corte.

### Desvincular y borrar

- Desvincular no borra bytes mientras existan otras referencias o una publicación
  en vuelo.
- El borrado físico sólo se solicita para un asset sin referencias productivas.
- Si el proveedor no confirma el borrado, StoreCore conserva `DeletePending`,
  oculta el asset de nuevas selecciones y reintenta de forma idempotente.
- La UI no declara borrado definitivo hasta leer el estado autoritativo.

## Reglas y límites

- Formatos iniciales: JPEG, PNG y WebP estáticos. SVG, GIF/animación, PDF y
  cualquier tipo desconocido se rechazan.
- Máximo por archivo: 10 MiB de entrada; máximo 16 megapíxeles y lados entre
  320 y 6000 px. Estos valores son configuración tipada, no strings UI.
- La imagen normalizada elimina metadata y perfiles no necesarios; se corrige
  orientación y se preserva una representación web segura.
- Máximo 20 imágenes publicadas por producto y 12 por variante. Galerías legacy
  mayores siguen legibles pero no pueden guardarse hasta cumplir el límite.
- Texto alternativo editable de 1–180 caracteres vive en `productImage`; una
  variante lo hereda. Filas legacy se migran una vez desde el nombre autoritativo
  del producto y quedan luego editables.
- El backend nunca descarga la URL pegada por el usuario. Las URLs históricas
  aprobadas siguen legibles. Una legacy fuera de política aparece al ADMIN como
  `Blocked` para reemplazo y en público produce placeholder, nunca URL.
- Fallo o ausencia de proveedor deja upload deshabilitado con explicación
  honesta; catálogo, edición textual y lectura pública continúan disponibles.
- La pantalla consulta una capability tipada con disponibilidad, formatos,
  límites y concurrencia. `Unknown/Unconfigured` deshabilita preventivamente el
  control y explica el motivo.
- No hay edición avanzada, video, IA generativa, CDN propio, migración masiva de
  URLs históricas ni sincronización de imágenes con Mercado Libre en este corte.

## Estados visibles cerrados

- Upload: `Idle`, `Validating`, `Uploading`, `Ready`, `Rejected`, `Failed`,
  `Unknown`.
- Asset: `AwaitingBytes`, `StoredPrivate`, `Attached`,
  `DeletePending`, `Deleted`, `Failed`, `Unknown`.
- Composición: `Loading`, `Editing`, `Saving`, `Conflict`, `Saved`, `Error`,
  `Unknown`.

Las etiquetas y reglas pertenecen al tipo; componentes y tests no comparan
strings wire.

## Criterios de aceptación

- ADMIN puede cargar una imagen sin pegar una URL y recibe una referencia opaca
  con preview autenticada; una sesión anónima no obtiene esos bytes.
- OPERATOR, CUSTOMER, visitante, CSRF ausente/cruzado y origen inválido no
  pueden cargar, vincular ni borrar media.
- Repetir el mismo `uploadId` en el mismo borrador/actor y con igual huella no
  duplica bytes ni registros;
  reutilizarlo con otra huella devuelve conflicto sin alterar el asset anterior.
- Otro actor, borrador o producto no puede consultar, reclamar, reintentar,
  adjuntar o borrar ese upload aunque conozca los IDs.
- MIME declarado distinto de magic bytes, archivo truncado, polyglot no
  normalizable, exceso de tamaño/píxeles o formato no permitido se rechazan sin
  crear un asset listo.
- PDP muestra la galería por `sortOrder`, cambia a media de variante y aplica el
  fallback general definido.
- Selecciones `Incomplete`, `Unknown` y `Absent` multivariante sin variante
  resuelta no inventan un SKU ni una variante: mantienen galería general,
  precio, stock e intención coherentes con el option schema. Una variante ya
  resuelta por selección explícita, intención o `selectGeneric(SKU)` usa su
  media; `Absent` univariante puede autoelegirse mediante el mismo motor.
- Portada y órdenes son deterministas; índices duplicados, asset ajeno, estado
  no listo o dos portadas se rechazan atómicamente.
- Conflicto concurrente no pierde la composición más nueva ni el borrador local.
- Pérdida de respuesta se recupera por `uploadId`: la UI resincroniza sesión/CSRF,
  hace GET autoritativo y sólo reenvía los mismos bytes en `AwaitingBytes`.
- Un fallo del proveedor no expone secretos, cuerpos crudos, firmas ni rutas
  internas en API, logs, auditoría o UI.
- Assets huérfanos y borrados pendientes tienen reconciliación idempotente,
  métricas y trazabilidad; no se eliminan referencias productivas.
- Antes de publicar, durante staging, tras CAS fallido o con producto inactivo,
  la ruta same-origin conocida deniega entrega. Después de despublicar, nuevas
  lecturas se deniegan; una URL firmada ya emitida puede vivir como máximo 60 s,
  límite visible y probado, nunca indefinidamente por caché.
- Lecturas públicas sólo emiten URLs HTTPS de host y cuenta permitidos y valores
  canónicos; datos corruptos se traducen a `Unknown` y se omiten de la galería.
- Las pruebas cubren PostgreSQL 16, reinicio, carreras, reintentos, rollback,
  autorización, accesibilidad y responsive 390/768/1440.
- Browser cubre dos variantes/color e intención restaurada; cambiar foto no
  altera SKU, cantidad, precio ni stock seleccionados.

## Trazabilidad RN-13

RN-13 ya registra el baseline URL-only y la transición condicionada a este WIP.
Sólo después de implementar y validar los gates se vuelve efectiva la escritura
de upload administrado; este spec no afirma runtime ni concede GO live.

## Dependencias externas y GO

La implementación local puede usar un adapter de prueba aislado. Activar
Cloudinary exige cuenta titular, cloud name, credenciales por referencia,
allowlist de egreso, preset/política acordados, límites operativos, evidencia en
ambiente no productivo y nuevo GO de seguridad. Ningún secreto se versiona.
