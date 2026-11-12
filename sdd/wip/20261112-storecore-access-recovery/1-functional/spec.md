# Especificación funcional

## Objetivo de negocio

Dar una recuperación profesional y segura desde el único acceso visual de
StoreCore. El usuario no necesita conocer detalles técnicos, pero sí indicar si
recupera su cuenta de compra o el acceso de administración. Esa elección es
idéntica para emails existentes e inexistentes y nunca revela cuentas.

## Historias y criterios de aceptación

### AR-F01 — Solicitar recuperación

1. Desde `/login` se accede a `/recover` conservando sólo un destino de retorno
   cerrado y permitido.
2. La persona elige CUSTOMER o USER e ingresa su email.
3. Para un email sintácticamente válido, la respuesta pública es neutral:
   «Si corresponde, vas a recibir instrucciones». No afirma existencia ni envío.
4. Ausente, inactivo, USER sin rol conocido y elegible tienen el mismo status,
   cuerpo y headers cuando el servicio está configurado.
5. Si el servicio de entrega está globalmente no configurado, todos los emails
   reciben la misma indisponibilidad; no se crea un token utilizable.

### AR-F02 — Abrir un enlace

1. El enlace tiene formato exacto
   `/reset-password#realm=<customer|user>&token=<base64url>`; el realm es un
   tipo cerrado y `Unknown` no prueba ambos endpoints ni produce requests.
2. El GET de `/reset-password` no cambia credenciales ni consume el token.
3. El secreto vive sólo en memoria y se retira de la URL; no se guarda en
   localStorage, sessionStorage, logs, métricas ni auditoría.
4. La inspección sólo informa estados cerrados y no expone email, subject id,
   roles ni datos del otro realm.
5. Un enlace inválido, vencido, usado o sustituido no habilita escritura.

### AR-F03 — Cambiar contraseña

1. Una contraseña válida tiene entre 12 y 128 puntos de código Unicode, sin
   trim, normalización ni truncado silencioso.
2. El token, contexto, cuenta activa, email actual y versión de credencial se
   revalidan dentro de la misma transacción que cambia el hash.
3. El token se consume una sola vez. Dos confirmaciones concurrentes producen
   exactamente un cambio efectivo.
4. Se revocan todas las sesiones todavía vivas del sujeto y realm afectados con
   evidencia SYSTEM/PASSWORD_RECOVERY. Sesiones, CSRF y contraseña del otro realm
   permanecen intactos aunque compartan email.
5. El flujo no inicia sesión automáticamente. Termina con CTA a `/login` y una
   intención cerrada `AuthenticateRecoveredRealm` para mostrar el login del
   realm recuperado aunque el otro realm conserve una sesión válida. No borra
   ni navega automáticamente a la sesión del otro realm.

### AR-F04 — Cerrar emisión tardía

1. Un login que verificó la contraseña anterior no puede emitir una sesión luego
   del reset.
2. Un challenge de selección creado antes del reset no puede emitir sesión para
   el realm reseteado.
3. Si un challenge dual conserva vigente el otro realm, sólo ese otro realm puede
   seguir emitiendo; no se fusionan versiones ni revocaciones.
4. Un cambio de email invalida candidatos, challenges y tokens emitidos para la
   dirección anterior.

### AR-F05 — Abuso y recuperación de fallos

1. Request e inspect/complete tienen presupuestos independientes del login.
2. Los límites agregados por IP e instancia se adquieren atómicamente antes de
   consultar email o token y pueden responder 429 con `Retry-After`; rotar
   destinos no los evade. La supresión por destino conserva la respuesta neutral.
3. Una respuesta perdida al completar no autoriza a afirmar éxito o fracaso. La
   UI guía a intentar login o pedir un nuevo enlace.
4. Solicitar de nuevo no invalida de inmediato un enlace legítimo anterior. El
   número de tokens vivos por sujeto es acotado; un reset exitoso invalida todos.

## Fuera de alcance / NO-GO

- Proveedor SMTP/API real, outbox cifrado, remitente, DNS de correo, secretos,
  métricas de entrega, deploy u homologación.
- Reset por email sin token, token en respuesta pública o endpoint de debug.
- Fusión CUSTOMER/USER, autologin, activación de cuenta o modificación de roles.
- Mercado Pago, ARCA, Correo Argentino, Mercado Libre live o StoreCore↔BlackStore.

## Limitación honesta del corte local

El email actual registrado se usa como destino del adapter futuro, pero StoreCore
todavía no conserva evidencia histórica `email_verified`. El fake de pruebas
demuestra el core y no acredita propiedad real de una casilla. Activar entrega
productiva exige decidir y homologar esa política.
