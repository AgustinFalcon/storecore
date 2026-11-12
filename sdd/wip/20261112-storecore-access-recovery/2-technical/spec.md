# Especificación técnica

## Arquitectura y tipos cerrados

- Kotlin: `RecoveryRealm`, `RecoveryTokenStatus`, `RecoveryRequestResult`,
  `RecoveryCompletionResult`, `RecoveryDeliveryState` y motivos de invalidación
  son enum/sealed con `Unknown` en el borde cuando corresponda.
- TypeScript: clases con constructor privado, instancias estáticas, reglas/labels
  propias y un único `fromWire`; stores y vistas no comparan strings mágicos.
- Pasos separados: capturar solicitud, solicitar, inspeccionar, capturar nueva
  contraseña, completar y finalizar. El orquestador sólo ordena.
- Puertos separados para repositorio de recovery, entrega, hash/token y reloj.
  Dominio no importa Spring, JDBC, HTTP ni Angular.

## Contrato HTTP local

Rutas fijan el realm; no aceptan `realm`, `subjectId`, roles ni destinatario en
el body:

- `POST /api/v1/customer/auth/recovery/requests` `{email}`
- `POST /api/v1/internal/auth/recovery/requests` `{email}`
- `POST /api/v1/customer/auth/recovery/inspect` `{token}`
- `POST /api/v1/internal/auth/recovery/inspect` `{token}`
- `POST /api/v1/customer/auth/recovery/complete` `{token,newPassword}`
- `POST /api/v1/internal/auth/recovery/complete` `{token,newPassword}`

Request configurado devuelve `202 data.kind=ACCEPTED` de forma neutral. Inspect
devuelve HTTP 200 con `READY`, `INVALID_LINK`, `EXPIRED_LINK`, `USED_LINK` o
`SUPERSEDED_LINK`. Complete devuelve HTTP 200 con `COMPLETED` o el resultado
terminal cerrado; una contraseña que no cumple política devuelve 422 con
`PASSWORD_POLICY_VIOLATION`. Presupuesto agotado devuelve 429 con `Retry-After`;
adapter global no configurado devuelve 503 `RECOVERY_UNAVAILABLE`. Body o
envelope malformado/futuro mapea a `Unknown`, nunca prueba otro realm y bloquea
efectos. Todos usan `no-store`, origen exacto y JSON acotado. El browser no
reintenta writes automáticamente.

## Persistencia forward-only

### V17 — coherencia de credenciales y challenges (Corte A)

1. Agregar `credential_version BIGINT NOT NULL DEFAULT 1 CHECK (>0)` a `users`
   y `customers`.
2. Agregar a `unified_access_challenges` versiones verificadas nullable y un
   estado cerrado `LEGACY_UNVERIFIABLE|VERIFIED`. Las filas anteriores quedan
   `LEGACY_UNVERIFIABLE`, sin UPDATE ni autoridad para emitir sesión. Las nuevas
   se insertan `VERIFIED` con versión para cada candidato presente; un CHECK
   exige esas correspondencias.
3. Reemplazar la función del trigger V11 para volver inmutables el estado y las
   versiones nuevas además de la evidencia existente. El upgrade preserva
   pendientes, consumidos y vencidos históricos y ninguno gana autoridad.

### V18 — recovery local (Corte B)

1. Crear `identity_recovery_tokens` con UUID, hash SHA-256 único, realm, FK
   excluyente USER/CUSTOMER, versión y digest del email capturados, timestamps,
   estado terminal/motivo cerrado y correlation id.
2. TTL fijo del core local: 15 minutos. Sólo hash del secreto se persiste.
3. Trigger impide borrar o reescribir identidad/evidencia y permite únicamente
   transición válida a consumido/superseded.
4. Permisos mínimos equivalentes a la frontera de identidad existente.

No se crea un outbox de correo falso. El adapter productivo default es
`UNCONFIGURED`; el capturador de secreto sólo se registra en tests.

## Concurrencia y transacciones

- `VerifiedAccessCandidate` incluye `credentialVersion`.
- `verify` lee esa versión. `issue` bloquea el sujeto y exige igualdad antes de
  crear una sesión.
- Un challenge `LEGACY_UNVERIFIABLE` nunca emite. El challenge `VERIFIED`
  persiste ambas versiones; al consumir valida sólo la del contexto elegido.
- Toda ruta adquiere primero un advisory lock transaccional por cada sujeto de
  identidad implicado, ordenado por `(realm,subjectId)`, y después sus filas de
  sujeto en el mismo orden. Esa raíz exclusiva serializa todos los caminos del
  mismo sujeto; recién entonces se toman sesiones ordenadas por UUID, CSRF,
  token/challenge y auditoría según el camino.
- `IdentityMutationCoordinator` recibe un `IdentityMutationScope` cerrado. Para
  comandos del propio sujeto deriva sólo el `Principal`; para revocación admin y
  suspensión CUSTOMER hace un preflight read-only del target, declara actor y
  objetivo, adquiere el scope ordenado y revalida el target bajo lock antes de
  verificar CSRF o producir efectos. Un scope `Unknown`/cambiado aborta todo.
- Perfil/email, logout y revocaciones autenticadas pasan por ese coordinador.
  Login/challenge sin sesión adquieren el scope del sujeto antes de emitir; reset
  usa scope/sujeto → token → sesiones ordenadas → auditoría. Ningún efecto ocurre
  si CSRF/sesión del actor falla. No se usa un mutex global para carrito, catálogo
  ni mutaciones de dominio no identitarias.
- Complete: lock sujeto y token, reloj DB después del lock, revalidación integral,
  hash nuevo, update contraseña+versión, consumo, supersesión de tokens hermanos,
  revocación de sesiones vivas y auditoría dentro de una transacción.
- El bulk de revocación filtra `revoked_at IS NULL`, `idle_expires_at` y
  `absolute_expires_at` para respetar el trigger V2.
- El cambio de email incrementa versión y supersede tokens del CUSTOMER.

## Entrega fail-closed

`RecoveryDeliveryPort` informa un estado cerrado. El default no configurado
rechaza globalmente antes de crear tokens. El fake de TestConfiguration captura
el secreto sólo en memoria y nunca lo sirve por HTTP. Una integración real deberá
agregar entrega asíncrona/outbox; si necesita recuperar el secreto, el payload
debe cifrarse con clave externa a DB y borrarse con retención corta. Eso requiere
otro SDD y homologación.

## Frontend

- Rutas productivas `/recover` y `/reset-password`; enlace desde `/login`.
- Enlace exacto `/reset-password#realm=<customer|user>&token=<base64url>`.
  `RecoveryRealm.fromWire` es el único traductor; `Unknown` retira el fragmento,
  muestra estado inválido y no consulta ninguno de los dos endpoints.
- Repository/use case/store propios; no reutilizar estado Demo ni login challenge.
- Token y contraseñas en memoria únicamente. Al leer el fragmento, retirar el
  secreto mediante `history.replaceState`; `Referrer-Policy: no-referrer` y sin
  terceros en la superficie.
- Estados request: Editing, Submitting, Accepted, RateLimited,
  ServiceUnavailable, Unknown.
- Estados reset: Inspecting, Editing, Submitting, Completed, Invalid, Expired,
  Used, Superseded, RateLimited, ServiceUnavailable, Uncertain, Unknown.
- Validación explícita por puntos Unicode; confirmación de contraseña; pegar
  permitido; `autocomplete=new-password`.
- Inputs tienen label y error asociado, `aria-invalid` sólo al fallar; el primer
  error o estado terminal recibe foco. Controles permanecen montados pero
  deshabilitados durante request/cooldown; el reintento habilitado se anuncia una
  vez. Expirar durante edición bloquea submit; respuesta perdida produce
  `Uncertain`. Unit/axe/teclado prueban estos contratos en mobile y desktop.
- Tras completar, el CTA transporta la intención tipada
  `AuthenticateRecoveredRealm(realm)`; `LoginStore.initialize` omite sólo la
  navegación automática incompatible y preserva la sesión del otro realm.

## Presupuestos del corte local

- Request: 60/15 min por IP y 3.000/15 min por instancia, adquiridos atómicamente
  antes del lookup; además 20/15 min por IP+digest+realm. Máximo 10.000 destinos.
- Inspect/complete: 120/15 min por IP y 10.000/15 min por instancia antes del
  lookup; además 10/15 min fallidos por IP+hash. Máximo 10.000 hashes.
- Saturar cardinalidad o presupuesto agregado responde 429 de forma uniforme;
  la supresión por destino responde igual que `ACCEPTED` y no crea token.
- Máximo tres tokens vivos por sujeto/realm; un cuarto request elegible se suprime
  manteniendo la respuesta neutral.
- Estos límites protegen una instancia. Activación de entrega real exige cuotas
  durables/globales y capacidad pendiente explícita.

## Pruebas obligatorias

- Dominio/traductores/Unknown y política Unicode compartida.
- Migración limpia y upgrade V16→V17 con challenges legacy pendientes,
  consumidos y vencidos; todos permanecen sin autoridad. Upgrade V17→V18.
- Neutralidad request y adapter unconfigured global.
- Same-email dual realm, token de realm incorrecto, email cambiado, inactivo,
  USER sin rol, expirado/usado/superseded/malformado.
- Doble complete, expiración esperando lock y rollback de auditoría/persistencia.
- login viejo→reset→issue y challenge viejo→reset→select.
- Carrera determinista perfil/email+CSRF contra reset/cambio de versión, probando
  orden de locks, rollback y ausencia de deadlock.
- Revocaciones ADMIN cruzadas, suspensión CUSTOMER contra reset y actor revocado
  durante espera: scope ordenado, target revalidado y cero efectos no autorizados.
- Revocación viva exacta, sesiones vencidas intactas y otro realm preservado.
- Angular unit/a11y y E2E PostgreSQL/Spring/Angular HTTPS con capturador fake.
- E2E same-email y ambas sesiones: reset de cada realm, CTA y login con nueva
  credencial del afectado sin cerrar ni auto-redirigir al otro.

## Gate de release

Core local puede mergearse fail-closed tras Verify y dos reviews GPT-6.1 Sol del
SHA exacto. Ninguna evidencia fake habilita correo real, deploy u homologación.
