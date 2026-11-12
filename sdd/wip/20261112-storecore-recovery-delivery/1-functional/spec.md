# Especificación funcional

## Objetivo

Permitir que CUSTOMER y USER demuestren propiedad de su correo y, sólo entonces,
reciban enlaces de recuperación mediante una cola durable. Ninguna respuesta
pública revela si una cuenta existe, está verificada o recibió correo.

## RD-F01 — Verificación de correo

1. Una cuenta nace o migra con ownership `Unknown`; una migración nunca inventa
   verificación histórica. Cambiar contraseña no altera ownership; cambiar email
   sí lo invalida.
2. Una persona autenticada puede solicitar verificación únicamente para el email
   actual de su propio realm. La respuesta es neutral.
3. Abrir el enlace sólo inspecciona. Un scanner o preview no verifica nada: la
   persona debe activar «Confirmar mi correo». El enlace de un solo uso expira,
   no inicia sesión y no modifica roles ni el otro realm aunque compartan email.
4. Confirmar el enlace registra evidencia durable de email, realm, sujeto,
   `email_version` y digest del email; nunca conserva el secreto.
5. Cambiar el email invalida la evidencia anterior y los enlaces pendientes.

## RD-F02 — Recuperación entregable

1. Recovery conserva exactamente la experiencia neutral ya aprobada.
2. Sólo una cuenta activa, elegible y con email verificado puede encolar un
   enlace. Cualquier otro caso responde igual y no crea token utilizable.
3. Crear token y outbox ocurre en una transacción. Si no puede persistirse el
   mensaje cifrado, no queda token autorizado.
4. Aceptado significa “encolado”, nunca “entregado”. La UI no promete recepción.
5. El worker revalida inmediatamente antes del handoff SMTP y cancela
   best-effort un mensaje obsoleto. Si la invalidación ocurre durante/después del
   handoff, el correo puede llegar, pero su enlace es siempre inutilizable.

## RD-F03 — Operación y fallos

1. El default productivo continúa `UNCONFIGURED`; sin keyring, remitente y SMTP
   válidos no se crea token ni outbox.
2. El worker usa lease, reintentos acotados con backoff y un estado terminal
   `Dead`; reiniciar no duplica envíos confirmados.
3. Fallos SMTP no exponen destinatario, token, credenciales ni contenido en logs,
   métricas, auditoría o respuestas HTTP.
4. Operación dispone de conteos agregados por estado y antigüedad, sin PII.
5. Los metadatos quedan auditables, pero el payload secreto se destruye al llegar
   a cualquier estado terminal o vencer. Rotar claves permite leer sólo eventos
   activos anteriores y escribir con la clave activa; falta de una clave aún
   requerida impide arrancar el worker.

## RD-F04 — Experiencia frontend

1. `/customer/profile` y la nueva `/user/account` muestran dos dimensiones
   separadas: ownership `Unknown|Verified` y solicitud
   `Idle|Submitting|Accepted|RateLimited|Unavailable|Unknown`.
2. Solicitar/repetir verificación conserva foco, cooldown y mensajes neutrales;
   registro CUSTOMER dirige al perfil con CTA no bloqueante.
3. `/verify-email#realm=<customer|user>&token=<secret>` elimina el fragmento
   antes de consultar; `Unknown` no prueba ambos realms.
4. Éxito ofrece volver al perfil o login; nunca autologuea ni cambia de realm.
5. Ownership desconocido bloquea sólo recovery. No bloquea compra, pedidos,
   catálogo ni operación administrativa ya autorizada.

## RD-F05 — Rollout histórico

1. Se despliega primero `VERIFICATION_ONLY`: permite verificar desde una sesión
   existente, pero recovery externo continúa indisponible globalmente.
2. Antes de `RECOVERY_ENABLED` debe existir al menos un ADMIN activo con email
   verificado y evidencia de prueba de entrega de la instalación.
3. La activación exige un procedimiento externo, autorizado y auditado para
   recuperar operativamente una cuenta histórica sin acceso. Esta feature no
   agrega endpoint, contraseña maestra, reset administrativo ni bypass: después
   de recuperar acceso mediante el procedimiento homologado, la persona confirma
   el email por enlace. El soporte nunca marca ownership ni fabrica evidencia.

## Fuera de alcance

- Credenciales, remitente o DNS reales; deploy y homologación SMTP.
- Tracking de apertura, marketing, campañas o adjuntos.
- Marcar como verificado por importación, fecha inventada o acción administrativa.
- Mercado Pago, ARCA, Correo Argentino, Mercado Libre y BlackStore live.
