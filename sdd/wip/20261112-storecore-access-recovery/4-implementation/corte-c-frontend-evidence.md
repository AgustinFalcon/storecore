# Corte C — frontend local y límites de evidencia

Fecha: 2026-11-12. Base de trabajo: `c70e2875b059426e0196b0984a05d73fd7e3fdff`.
Cambios de este corte todavía sin commit; este documento no constituye review
exact-head, CI ni autorización de merge.

## Implementación

- `/recover` productivo, enlace desde `/login` y destino cerrado conservado.
  Contextos estables cuenta de compra/administración, sin lookup público de realms.
- `/reset-password`, secreto base64url de 43 caracteres y realm en fragmento.
  Limpieza inmediata de URL y sincronización posterior del Router para soportar
  reabrir el mismo enlace. No persistencia del secreto ni contraseña.
- Tipos cerrados propios, pasos de dominio y repository HTTP separado. Mapper
  estricto 202/200 por operación; errores tipados, Unknown y expiración READY.
  Sin ampliar `readApiBody`, sin fixtures Demo ni proveedor de correo.
- Formulario Unicode 12–128 puntos de código, confirmación, errores asociados,
  foco, teclado, controles montados durante carga/cooldown, anuncio único de
  reintento, expiración local y resultado incierto tras respuesta perdida.
- `AuthenticateRecoveredRealm` permite ingresar aunque la otra sesión siga viva.
  Éxito confirmado limpia sólo snapshot/generación del realm recuperado; no autologin.
- Interceptor excluye los seis endpoints públicos de recovery. El repository
  además usa HttpBackend para evitar efectos de sesión/CSRF ante errores públicos.
- Shell conserva acceso a recovery con sesiones duales. El host SC03 publica
  sólo pathname: nunca fragment/query. Índice sin terceros y referrer `no-referrer`.
- PSD SC-SURF-03 reconoce ruta/contratos locales y mantiene residual explícito de
  entrega real y prueba browser de éxito con capturador privado.

## Validación ejecutada

- `npm run verify`: PASS. Arquitectura 9/9 y scan, lint, 178 archivos/1190 tests,
  build productivo. Windows requirió runner fuera del sandbox por ACL del compilador.
- `npm run check:recovery-real`: PASS (sintaxis runner, TypeScript, ESLint,
  descubrimiento de 1 escenario real).
- `npm run test:a11y`: 79/79 PASS de la suite browser completa, incluida recovery.
  El inventario Not Found histórico se ajustó de `/recover` a `/recover/no-existe`
  para reflejar la nueva ruta productiva manteniendo cobertura de desconocidos.
- `npx playwright test e2e/recovery.spec.ts`: 12/12 PASS, incluyendo neutralidad,
  fragmento sin persistencia/host leak, terminales, cooldown, expiración, respuesta
  perdida, mismo email y sesiones duales en ambos sentidos, teclado y axe en
  320/1440 px. Estos escenarios interceptan HTTP y no acreditan backend real.
- `npm run test:recovery-unconfigured-real`: PASS. PostgreSQL 16 efímero nuevo,
  migraciones V1–V18, jar de producción sin TestConfiguration/profiles fake,
  Angular HTTPS, navegador sin interceptar HTTP. Emails conocido/desconocido y
  ambos contextos recibieron 503 `RECOVERY_UNAVAILABLE`/no-store; SQL verificó cero
  recovery tokens. Trace, screenshot y video deshabilitados. Servicios, container
  y certificados efímeros eliminados; comprobación posterior sin container residual.
- `git diff --check`: PASS.

## Pendiente explícito

AR-016 permanece abierto: falta E2E browser exitoso PostgreSQL/Spring/Angular
con capturador exclusivamente de tests y transporte privado en memoria entre
JVM y browser. No se agregó endpoint de debug, archivo ni stdout de secretos.
La evidencia de integración backend y los escenarios HTTP interceptados del
frontend no sustituyen ese gate. Proveedor/email real, deploy y homologación NO-GO.

## Follow-up de revisión UX

Se corrigieron dos P2 y un P3 detectados en la revisión read-only del corte:

- Todo CTA a login desde reset con realm conocido transporta la intención tipada,
  también ante resultado incierto/usado. Se prueba pérdida de respuesta después
  de aplicar reset con la otra sesión viva, para CUSTOMER y USER.
- Resultados terminales eliminan errores de formulario previos. Mismatch o rechazo
  de política seguido de vencimiento muestra el mensaje terminal y recibe foco.
- Unknown de solicitud ofrece acción explícita para volver a edición conservando
  email/contexto, sin repetir automáticamente HTTP ni interpretar el wire futuro.

Validación posterior al follow-up: `npm run verify` PASS, arquitectura/lint/build y
178 archivos/1192 tests; recovery Playwright 16/16 PASS, incluido foco y axe
320/1440. La suite browser global 79/79 y la prueba real UNCONFIGURED 1/1 descritas
arriba corresponden al corte anterior al follow-up; no se presentan como reruns
del source posterior. `git diff --check` PASS. AR-016 sigue pendiente.
