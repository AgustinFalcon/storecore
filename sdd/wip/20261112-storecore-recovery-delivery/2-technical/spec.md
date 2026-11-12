# Especificación técnica

## Tipos cerrados y fronteras

- Kotlin: `EmailOwnershipState`, `VerificationRequestState`,
  `EmailVerificationTokenState`, `IdentityMessageKind`, `IdentityOutboxState`,
  `SmtpDeliveryResult` y `EmailDeliveryMode` son `enum`/`sealed`; wire
  desconocido mapea a `Unknown`. Ownership, request y disponibilidad nunca son
  el mismo tipo.
- TypeScript: clases de constructor privado con instancias estáticas y un único
  `fromWire`. Vista y stores no comparan literales.
- Pasos separados: emitir verificación, confirmar, encolar, adquirir lease,
  descifrar/renderizar, entregar y confirmar/reprogramar.
- Dominio no importa JDBC, Spring Mail, HTTP ni Angular.

## V19 forward-only

1. `users` y `customers` reciben `email_version BIGINT NOT NULL DEFAULT 1`; sólo
   cambia cuando cambia el email. `identity_email_verification_evidence` es
   append-only y contiene realm/sujeto excluyente, `email_version`, digest,
   `verified_at` y correlation id. Ownership `VERIFIED` se deriva sólo de una
   evidencia que coincide con email/version actuales; de otro modo es `UNKNOWN`.
2. `identity_email_verification_tokens` persiste sólo SHA-256 del secreto, TTL,
   `email_version`/`email_digest` capturados y estado terminal. Trigger impide reescribir
   identidad/evidencia.
3. `identity_message_outbox` usa UUID generado antes del INSERT, `kind`, realm,
   `user_id`/`customer_id` como FKs nullable exclusivas según realm y dos FKs
   nullable exclusivas: `verification_token_id` para `EMAIL_VERIFICATION`,
   `recovery_token_id` para `PASSWORD_RECOVERY`. CHECKs locales exigen XOR de
   sujeto/token y coherencia kind/realm; un constraint trigger diferible valida
   que el token referenciado pertenece al mismo realm y sujeto antes del commit
   (PostgreSQL CHECK no consulta filas referenciadas). El evento y sus metadatos
   son inmutables y no contienen email/token en claro.
4. `identity_message_secret` contiene `key_id`, ciphertext/nonce del payload y
   DEK envuelta/nonce. Es una fila efímera y borrable sólo por la función del
   worker. Se elimina al finalizar, quedar uncertain, cancelar o vencer; el
   evento sin PII permanece.
5. `identity_message_delivery` separa proyección mutable con estados
   `PENDING|LEASED|RETRY|SENT|UNCERTAIN|DEAD|CANCELLED`, intentos,
   `available_at`, lease, error categórico cerrado y timestamps. No persiste
   texto de excepción. `UNCERTAIN` es terminal y jamás reintenta automáticamente.
6. Índices/constraints evitan más de un mensaje activo por token y permiten
   adquisición `FOR UPDATE SKIP LOCKED`.

## Grafos de estado persistidos

- Verification token: `PENDING → CONSUMED|SUPERSEDED`; expiración se deriva del
  reloj DB y jamás autoriza `CONSUMED`. No hay transición desde terminal.
- Delivery: `PENDING|RETRY → LEASED`; `LEASED → SENT|RETRY|UNCERTAIN|DEAD|CANCELLED`;
  lease vencido puede pasar `LEASED → RETRY`; el reaper puede hacer
  `PENDING|RETRY → CANCELLED`. `SENT|UNCERTAIN|DEAD|CANCELLED` son terminales.
- Toda transición usa compare-and-set del estado/lease esperado y triggers que
  rechazan cualquier otro arco o reapertura. `Unknown` de DB falla cerrado y no
  es un estado persistible válido.

## Cifrado y secretos

- Payload mínimo JSON versionado: destinatario, realm, kind, secret y expiración.
- Envelope encryption: DEK aleatoria de 256 bits cifra payload con AES-256-GCM;
  KEK externa cifra la DEK, ambas con nonce aleatorio de 96 bits. AAD estable
  `installationId:eventId:kind:keyId`; ciphertext y tag se almacenan juntos.
- Keyring de KEK llega exclusivamente por secreto externo. `keyId` no es secreto;
  la activa envuelve nuevas DEK y claves de lectura sólo abren eventos activos.
  El startup verifica que toda fila secreta activa tenga una clave disponible.
- El objeto plaintext vive como `CharArray`/bytes de vida corta y se limpia en
  `finally` cuando la API lo permite. Nunca `toString`, MDC, tracing o JSON log.

## Transacción y elegibilidad

- Readiness es por capability: el port de verificación está `READY` en
  `VERIFICATION_ONLY|RECOVERY_ENABLED`; `RecoveryDeliveryPort` está `READY` sólo
  en `RECOVERY_ENABLED`. Cada request consulta su readiness global antes de
  cualquier lookup.
- Bajo el mismo `IdentityMutationScope`, revalida cuenta, email, `email_version` y
  `EmailOwnershipState.Verified`; luego crea token y outbox cifrado en una única
  transacción. Enqueue devuelve `ACCEPTED`; no llama SMTP dentro de la request.
- Cambio de contraseña conserva `email_version`. Cambio de email incrementa
  `email_version`, deriva ownership `UNKNOWN`, cancela
  enlaces/outbox pendientes y conserva evidencia histórica inmutable.
- Verificación sigue locks sujeto → token → outbox; confirmación concurrente es
  single-use y sólo una transición acredita propiedad.

## Contrato de verificación

- Token TTL 30 minutos; máximo tres tokens vivos por sujeto/realm. Un cuarto se
  suprime con respuesta neutral. Cooldown UI 60 segundos.
- Request autenticado: 5/hora por sujeto y 1.000/hora por instalación, adquirido
  antes de emitir. Inspect/confirm público: 120/15 min por IP y 10.000/15 min por
  instalación; fallos 10/15 min por IP+hash.
- Inspect no mutante devuelve `READY|INVALID_LINK|EXPIRED_LINK|USED_LINK|SUPERSEDED_LINK`.
  Confirm requiere POST explícito y devuelve `VERIFIED` o el mismo terminal
  cerrado. Nunca confirma mediante GET/navigation.
- Rutas por realm: `/api/v1/customer|internal/auth/email-verification/requests`,
  `/inspect` y `/complete`. El body nunca contiene realm, subject id ni email de
  destino; request usa el principal autenticado y CSRF.

## Worker SMTP

- Modos cerrados: `UNCONFIGURED`, `VERIFICATION_ONLY`, `RECOVERY_ENABLED`.
  Sólo `UNCONFIGURED` arranca sin SMTP. Los otros exigen keyring, host, puerto,
  usuario, secreto, remitente, origin HTTPS y TLS con hostname verification;
  cualquier dato faltante/inválido falla el startup.
- Timeouts: conexión 5 s, lectura/escritura 10 s. Lease 60 s; máximo cinco
  intentos. Backoff 30 s, 2 min, 10 min y 30 min, con jitter acotado ±20%.
- Adquisición corta por lease; la red ocurre fuera de transacción; confirmación
  compara lease owner. Sólo un fallo inequívoco anterior a `DATA`/handoff SMTP
  puede pasar a `RETRY` con backoff y jitter. Timeout, desconexión o pérdida de
  respuesta durante/después de `DATA`, o cualquier caso sin certeza de aceptación,
  pasa a `UNCERTAIN` terminal, destruye el payload y nunca reenvía. Rechazo SMTP
  4xx explícito anterior a aceptación puede reintentar; autenticación/configuración
  y expiración pasan a `DEAD` o `CANCELLED` según tipo cerrado.
- Idempotencia efectiva: `Message-ID` determinista por event UUID y estado SENT
  durable. SMTP no ofrece exactly-once tras pérdida de respuesta; ese riesgo se
  registra como `UNCERTAIN`, destruye el payload secreto y no se reenvía
  automáticamente.
- Antes del handoff revalida token, email/version y expiración. Esa validación es
  best-effort respecto de la red; la autorización siempre vuelve inútil un link
  invalidado aunque el mensaje haya salido.
- Retención secreta: se destruye inmediatamente al estado terminal y el reaper
  cancela+destruye activos vencidos al menos una vez por minuto.
- Plantillas son locales, escapadas, sin contenido arbitrario ni URLs externas;
  origin exacto de instalación HTTPS.

## HTTP y frontend

- GET propio de estado de email por realm autenticado. CUSTOMER usa
  `/customer/profile`; USER agrega `/user/account`, accesible a cualquier rol USER
  conocido, sin reutilizar `/user/profile-import`.
- POST autenticado de solicitud con CSRF; respuesta neutral y cooldown.
- POST público de inspect/complete por ruta de realm, con budgets separados.
- `/verify-email` aplica la misma disciplina de fragmento y referrer que recovery.
- Ningún endpoint expone outbox, destinatario, token ni diagnóstico SMTP.

## Pruebas obligatorias

- Migración limpia y V18→V19; constraints, ACL, triggers e inmutabilidad.
- Constraint trigger diferible rechaza token/outbox de realm o sujeto distinto.
- Unknown histórico, verificación single-use, cambio de email y same-email dual
  realm aislado.
- Cambio de contraseña y recovery exitoso conservan ownership cuando el email no
  cambia; cambio de email lo invalida.
- Rollback conjunto token+outbox, keyring inválido, tamper GCM, rotación y clave
  retirada.
- PG16 real: dos workers, lease vencido, crash/reinicio, SKIP LOCKED, retry,
  uncertain y cancelación por expiración.
- SMTP fake distingue fallo pre-DATA reintentable de pérdida post-DATA uncertain
  sin segundo envío.
- SMTP fake sólo en tests: contenido/Message-ID/enlace correctos, sin secretos en
  logs ni artefactos.
- Angular unit/a11y y browser real para ambos realms, fragment cleanup, Unknown
  sin probes y recovery sólo después de verificación real en fixture.
- Scanner abre el enlace sin consumirlo; sólo el botón explícito confirma.
- Rollout `VERIFICATION_ONLY`, ADMIN verificado obligatorio y negativa de
  `RECOVERY_ENABLED` sin ese preflight.
- Matriz de readiness por modo/capability y negativa antes del lookup.

## Gate de activación

Mergear código no activa correo. Producción requiere credenciales por titular,
remitente, SPF/DKIM/DMARC, prueba de inbox/spam, rotación/backup de keyring,
alertas, runbook y homologación explícita. El rollout usa primero
`VERIFICATION_ONLY`; `RECOVERY_ENABLED` exige al menos un ADMIN verificado y
evidencia de entrega. Hasta entonces recovery falla cerrado.
El procedimiento externo de recuperación operativa de cuentas históricas es un
prerrequisito homologado y no forma parte del código de esta feature.
