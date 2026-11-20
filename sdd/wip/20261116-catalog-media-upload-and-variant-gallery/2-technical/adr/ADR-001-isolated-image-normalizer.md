# ADR-001 — normalizador de imagen aislado y versionado

## Estado

Aceptado para el contrato `MEDIA-NORMALIZE-001`. El parser estructural de
`MEDIA-NORMALIZE-002` está implementado. `MEDIA-NORMALIZE-003A` está fusionado.
`MEDIA-NORMALIZE-003B-1` y `MEDIA-NORMALIZE-003B-2` están fusionados.
`MEDIA-NORMALIZE-003B-3` está fusionado. `MEDIA-NORMALIZE-003B-4` agrega la
factory fail-closed, `systemd-run` y attestación cgroup v2. `Ready` sólo
existe cuando el aislamiento Linux está atestado y el SELF_TEST corre dentro
del sandbox. Windows permanece `Unavailable` sin Job Object. Upload continúa
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
- El worker hashea el jar que ejecuta desde `ProtectionDomain/CodeSource`. Un
  CodeSource empaquetado válido es autoritativo: la propiedad
  `storecore.media.worker.jar` sólo cubre tests in-process cuando CodeSource no
  es un jar; si la propiedad apunta a otra ruta, falta, es directorio, symlink,
  no-jar o ZIP sin entradas, falla cerrado.
- El fingerprint incluye vendor y versión runtime Java exactos; Linux
  amd64/arm64 y Windows amd64 (este último sólo para tests); inventario runtime
  exacto; módulos TwelveMonkeys 3.15.3; providers ImageIO cerrados; política y
  parámetros `IMAGE_IO_V1`; y hashes de un corpus built-in versionado.
- El padre compara nonce y digests con `MessageDigest.isEqual`, además de
  igualdad exacta del resto. Drift o `Unknown` produce `Unavailable`. El único
  vocabulario de evaluación es `Matched | Unavailable | Unknown`.

### Contención Linux y factory (003B-4)

- El launcher productivo invoca únicamente `/usr/bin/systemd-run` o
  `/bin/systemd-run` root-owned. No hay fallback a `ProcessBuilder` de `java`.
- `Ready` exige Linux amd64/arm64, cgroup v2, usuario `storecore-media-worker`,
  `NoNewPrivileges`, namespaces, sin AF_INET/AF_INET6, `KillMode=control-group`,
  `MemorySwapMax=0`, `memory.oom.group`, `TasksMax`, `CPUQuota`, RLIMIT y
  SELF_TEST `Matched` dentro de esa unidad. Cualquier fallo es `Unavailable`.
- Cada ejecución usa una unidad con nombre propio, `RuntimeMaxSec` y
  `TimeoutStopSec`. El padre ordena kill/stop mediante `systemctl` atestado y
  sólo libera admisión y workspace tras verificar estado terminal sin PID,
  cgroup ni job. Una terminación no verificable retiene el workspace y cierra
  nuevas admisiones hasta intervención/reinicio.
- El workspace privado backend-only (0700/0600) declara incompatibilidad con
  el UID dedicado y nunca puede producir `Ready`. El futuro handoff Linux será
  otro adapter que pruebe ambos principals; no se relajan permisos ni checks
  de owner del manager privado.
- Vendor/versión Java esperados provienen de un perfil aprobado independiente;
  OS/arquitectura deben coincidir con la attestación del padre. El worker lleva
  un inventario de dependencias filtrado y versionado dentro del JAR sombreado,
  validado por la factory sobre el artefacto real.
- Windows productivo permanece `Unavailable` hasta un Job Object equivalente.

#### Residual obligatorio: broker cross-UID y evidencia Linux real

El launcher/factory fail-closed no completa por sí solo `003B-4`. El adapter de
workspace privado backend-only conserva `0700/0600`, por lo que es
intencionalmente incompatible con el UID dedicado. El cierre se divide en tres
cortes trazables:

- `003B-4A` — factory, unidad transitoria, terminación verificada y retención
  insegura fail-closed. Este corte no puede devolver `Ready` mientras use el
  workspace privado.
- `003B-4B` — broker Linux cross-UID, workspace acotado y reconciliación de
  reinicios. Es un adapter distinto; no relaja el manager privado.
- `003B-4C` — harness Linux real que prueba principals distintos, límites
  efectivos, SELF_TEST/NORMALIZE, terminación, cleanup y recuperación. Sólo el
  conjunto `4A+4B+4C` puede completar `003B-4`.

El broker es un servicio local root-owned con una API Unix tipada y cerrada. El
socket es root-owned, no es world-accessible y autentica cada conexión mediante
`SO_PEERCRED` contra el UID/GID backend configurado en un archivo root-owned.
Rechaza al UID worker. Cada job queda ligado durablemente al principal, boot-id
y revisión monotónica que lo creó; las mutaciones posteriores usan
compare-and-set de revisión. UUID o mensajes repetidos no transfieren
autoridad. El framing limita tamaño/cantidad de campos y traduce opcode/estado
desconocido a `Unknown` antes de ejecutar efectos. La matriz cerrada de
operaciones por estado incluye allocate, seal, start, terminate, inspect,
acknowledge y quarantine. No acepta comandos, paths, nombres de unidad,
propiedades systemd ni argumentos arbitrarios. El backend sólo envía un UUID de
job, el digest esperado y un `MediaIsolationProfileId` permitido. El broker
deriva todos los paths, nombres y límites desde configuración root-owned; llama
systemd por D-Bus y nunca entrega `sudo`, `systemctl` o `systemd-run` genéricos
al proceso Spring.

Cada job usa un mount `tmpfs` propio, `nosuid,nodev,noexec`, con límite total de
48 MiB, límite de inodos y directorio raíz no reutilizable. `LimitFSIZE` se
conserva como defensa por archivo, pero no cuenta como cuota agregada.
`SealInput` no hace `chmod` o `chown` del inode escrito por el backend: un
FD/mmap previo seguiría siendo writeable. El backend pasa exactamente un FD
regular por `SCM_RIGHTS`; el broker valida tipo/size, copia con límite hacia un
inode nuevo `CREATE_EXCL` nunca abierto por el backend, sincroniza, vuelve a
medir, verifica digest y recién entonces lo publica root-owned/worker-readable.
Cambio de tamaño/metadata durante la copia, FD extra, device, directorio o
archivo no regular rechaza y cuarentena el job. El worker sólo ve ese snapshot
read-only en su mount namespace y escribe resultado/diag en paths `CREATE_NEW`
propios. El harness mantiene FD y mmap del origen abiertos y prueba que
escrituras, crecimiento y truncado posteriores no alteran el snapshot. Tras
estado terminal, el backend lee únicamente artefactos cuyo owner, modo, tamaño
y digest fueron atestados; el broker desmonta y elimina sólo después del ACK de
consumo y de probar ausencia de procesos.

Antes de montar o copiar, admisión reserva atómicamente presupuesto global de
jobs, mounts, bytes e inodos, incluido un presupuesto separado de cuarentena.
Trabajo terminal sin ACK conserva evidencia sólo hasta un TTL root-configured y
se reconcilia con el estado durable del cliente; nunca se desaloja si
terminación/unmount no están probados. Cliente muerto, ACK perdido o presupuesto
agotado cierran nuevas admisiones. El harness cubre múltiples allocations y
terminales sin ACK; no basta probar una cuota aislada por job.

El runtime no se toma del checkout, `PATH`, symlinks ni un directorio escribible
por la app. Java y el fat jar se instalan en una ruta versionada root-owned:
directorios y ejecutables `0555`, jar/datos `0444`, sin symlinks y con SHA-256
aprobado. El broker abre/valida la cadena con semántica `NOFOLLOW`, compara el
digest y usa esa ruta exacta. El SELF_TEST vuelve a acreditar el jar realmente
ejecutado y el harness prueba que el UID B puede ejecutar Java pero no escribir
el runtime.

El estado del broker es durable y monotónico:
`Allocated | InputSealed | Starting | Running | Terminating | Terminal |
Quarantined | Unknown`. Es un tipo cerrado; `Unknown` y cualquier transición
inválida bloquean admisión. Antes de aceptar jobs tras un reinicio, el broker
enumera su journal, mounts y unidades por identidad exacta. Mata/reconcilia lo
que siga activo y sólo limpia cuando no quedan PID, cgroup ni mount. Cualquier
discrepancia retiene evidencia, marca `Quarantined` y mantiene el gate global
cerrado hasta intervención explícita.

La attestación consulta la unidad efectiva por D-Bus y los archivos del cgroup
v2 real; no confía sólo en propiedades solicitadas. Debe probar UID/GID,
`NoNewPrivileges`, namespaces, familia de sockets, `KillMode`, swap, OOM group,
memoria, pids, CPU, runtime, RLIMIT, mount/quota, ruta/digest del runtime y
estado terminal. Ausencia, `Unknown`, valor más laxo o imposibilidad de leer
cualquiera de ellos produce `Unavailable`.

El harness `003B-4C` corre en Linux con backend UID A y worker UID B reales.
Demuestra, como mínimo: SELF_TEST y NORMALIZE exitosos dentro de la unidad;
denegación de acceso a otro job; cuota agregada; timeout/OOM/kill del cgroup;
output falso o sustituido rechazado; reinicio en cada transición durable;
retención ante terminación o unmount no verificables; y cleanup sólo después de
estado terminal. Mocks de `systemctl`, un mismo UID o `java -jar` directo no son
evidencia de cierre.

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
