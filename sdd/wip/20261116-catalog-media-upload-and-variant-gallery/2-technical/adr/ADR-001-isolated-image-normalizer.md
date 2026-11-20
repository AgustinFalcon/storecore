# ADR-001 — normalizador de imagen aislado y versionado

## Estado

Aceptado para el contrato `MEDIA-NORMALIZE-001`. El parser estructural de
`MEDIA-NORMALIZE-002` está implementado. `MEDIA-NORMALIZE-003A` está fusionado.
`MEDIA-NORMALIZE-003B-1` y `MEDIA-NORMALIZE-003B-2` están fusionados.
`MEDIA-NORMALIZE-003B-3` agrega self-test y evaluación de attestación offline,
todavía sin factory `Ready`, launcher productivo ni HTTP. Upload continúa
deshabilitado.

### Parámetros deterministas IMAGE_IO_V1 (003B-2)

Estos valores son parte del perfil. Cambiar cualquiera exige un perfil nuevo;
los goldens no se actualizan automáticamente.

- JPEG quality: `0.90` explícito.
- JPEG progressive: no (`MODE_DISABLED`).
- JPEG chroma subsampling: `4:4:4` (sin submuestreo).
- PNG: Deflate, compression quality `0.0` (máxima compresión del writer JDK),
  sin metadata de texto.
- Imagen sin ICC: se interpreta como sRGB 8-bit. ICC distinto de sRGB, CMYK
  o metadata incompatible: `UNSUPPORTED_COLOR_PROFILE` fail-closed.
- Orientación EXIF 1–8 mediante tipo cerrado; cualquier otro valor es
  `Unknown` y rechaza. Tras aplicar, se elimina EXIF/XMP/ICC del output.
- Alpha: si algún píxel tiene alpha ≠ 255, salida PNG; si es opaco, JPEG.
  RGB bajo alpha=0 se fuerza a (0,0,0) antes de encodear.
- Lanzamiento documentado del worker: CWD = workspace; sin argumentos;
  `java -Xmx<heap> -XX:MaxDirectMemorySize=<maxOutput> -Djava.io.tmpdir=<workspace> -jar storecore-media-worker.jar`.
  El FQCN fijo es `com.storecore.catalog.infrastructure.media.worker.MediaNormalizerWorkerMainKt`.
  El `PropertiesLauncher` del backend permanece test-only (003A) y no es
  contención productiva.

### Self-test y attestación offline (003B-3)

- `SELF_TEST(2)` comparte sólo el envelope V1; `NORMALIZE(1)` conserva bytes y
  semántica. El challenge es UUID + nonce de 256 bits y no agrega argumentos
  CLI.
- El worker hashea el jar que ejecuta desde `ProtectionDomain/CodeSource`. La
  propiedad `storecore.media.worker.jar` existe sólo como ruta documentada para
  tests in-process; ruta ausente, directorio, symlink o no-jar falla cerrado.
- El fingerprint incluye vendor y versión runtime Java exactos; Linux
  amd64/arm64 y Windows amd64 (este último sólo para tests); inventario runtime
  exacto; módulos TwelveMonkeys 3.15.3; providers ImageIO cerrados; política y
  parámetros `IMAGE_IO_V1`; y hashes de un corpus built-in versionado.
- El padre compara nonce y digests con `MessageDigest.isEqual`, además de
  igualdad exacta del resto. Drift o `Unknown` produce `Unavailable`. El único
  vocabulario de evaluación es `Matched | Unavailable | Unknown`; `Ready` no
  existe en este corte.

## Contexto

Los bytes son controlados por un usuario y un decoder en el mismo proceso no
puede garantizar que un timeout interrumpa trabajo nativo o libere memoria. El
contrato debe limitar tamaño, geometría, metadata, segmentos, diagnóstico,
workspace, heap, duración y concurrencia antes de conectar multipart o HTTP.

## Decisión

- El decoder/encoder se ejecutará en un helper JVM Java 21 separado. El padre
  aplica concurrencia, timeout y terminación forzada; cualquier identidad,
  versión o self-test desconocido deja la capability no disponible.
- La primera implementación fijará TwelveMonkeys `3.15.3`, únicamente módulos
  `imageio-core`, `imageio-jpeg` e `imageio-webp`, más PNG/JPEG del JDK. No se
  incorpora Batik, SVG, un bundle de coders, JNI ni proveedor externo.
- Se aceptarán JPEG, PNG y WebP estáticos. WebP es sólo lectura. La salida será
  JPEG para píxeles opacos o PNG para alpha, con parámetros deterministas,
  orientación aplicada y un raster sRGB nuevo sin metadata.
- `IMAGE_IO_V1` identifica librería, runtime, política y parámetros. Cambiar
  cualquiera exige un perfil nuevo; nunca se modifica silenciosamente el
  digest de un comando previo.
- CMYK, ICC no-sRGB, XMP ejecutable, múltiples frames, trailing bytes y valores
  desconocidos fallan cerrados. La conversión de perfiles queda fuera hasta
  aprobar una dependencia y un corpus deterministas.

Los límites iniciales son 10 MiB de entrada, 20 MiB de salida, 320–6000 px,
16 MP, heap 192 MiB, workspace 48 MiB, timeout 12 s, concurrencia 1, diagnóstico
64 KiB, 1024 segmentos/chunks y 1 MiB de metadata. Son objetos tipados; una
configuración inválida no se corrige ni se interpreta desde strings.

## Alternativas descartadas

- `ImageIO` en el proceso Spring con `Future.cancel`: no es límite duro de CPU o
  memoria y un decoder atascado sobrevive al timeout.
- ImageMagick/libvips: requieren binario nativo y una superficie adicional de
  módulos, delegates y política. Sólo se reconsideran mediante otro ADR.
- WebP writer JNI: aumenta superficie nativa y no es necesario para aceptar
  WebP como entrada.

## Consecuencias

Este ADR y el parser estructural puro no agregan dependencia, binario, endpoint,
migración ni activación. El artefacto ejecutable del helper y su distribución
deben probarse antes de cerrar TASK-005. TASK-006 conserva el ownership del
spool multipart y del directorio temporal no ejecutable.
