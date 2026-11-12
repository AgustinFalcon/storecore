# AR-016 — recuperación exitosa con navegador real

Fecha: 2026-11-12. Base de implementación: `17f794a6051a99671ec595f1096a8a66eda8140b`.
La evidencia corresponde al árbol local posterior al hardening del lifecycle;
el SHA candidato final debe registrarse en los gates de PR. No se acredita CI,
deploy, email real ni homologación.

## Resultado observado

`npm run test:recovery-success-real` terminó exit 0, con
`RECOVERY_BROWSER_PASSED cases=2` y resumen público 2/2.

Ambos journeys CUSTOMER y USER ejecutaron:

1. Login HTTP real para ambos realms con el mismo email y selección visual.
2. Solicitud desde Angular contra Spring/PostgreSQL 16, respuesta 202.
3. Lectura del capturador exclusivo de tests por el JVM padre y transferencia
   del secreto solamente al stdin privado del proceso Node hijo.
4. Apertura del enlace por Chromium, inspección HTTP 200 y formulario READY real.
5. Retiro del fragmento y ausencia del secreto en local/sessionStorage.
6. Cambio desde el formulario, respuesta HTTP 200 y resultado COMPLETED visible.
7. Cookie afectada expirada, sesión afectada rechazada y otra cookie/sesión intacta.
8. Contraseña anterior rechazada; CTA de login permite usar la contraseña nueva
   aunque el otro realm conserve sesión; el nuevo login real termina autorizado.
9. Reapertura del enlace con resultado USED visible y fragmento retirado.

El JVM comprobó después que cada sujeto afectado quedó en credential_version=2,
el otro en 1, y existe exactamente un evento IDENTITY_PASSWORD_RECOVERED por
sujeto/realm. No se simularon respuestas HTTP del flujo.

## Frontera del harness

- Entry point sólo en `backend/src/test`, importando RecoveryCaptureConfiguration.
- Node usa Chromium de la dependencia existente @playwright/test, sin runner
  que genere trazas, HAR, video, storageState ni snapshots de credenciales.
- Stdout del hijo contiene únicamente comandos/resultados públicos cerrados.
  Tokens no entran en stdout/stderr, argumentos, variables de entorno o archivos.
- Errores del browser se convierten en fases/clasificaciones tipadas; no se
  imprimen errores completos, cuerpos, DOM crudo ni URLs con fragmentos.
- PostgreSQL es un contenedor nuevo, desechable y enlazado sólo a loopback.
  Se conservó activo el guard real de instalación tras provisionar fixtures.
- Timeouts, hooks y finally cierran browser, procesos JVM/Angular, contenedor y
  certificado TLS temporal. El post-check observó cero contenedores propios,
  cero listeners 8080/4301 y cero procesos Chromium ms-playwright remanentes.

Los únicos artifacts del success runner son código compilado de tests, logs
sanitizados de supervisores y `success-summary.json` sin secretos.

## Reproducción

Desde backend:

```text
mvn -Dtest=RecoveryBrowserProtocolTest test dependency:build-classpath -DincludeScope=test -Dmdep.outputFile=target/recovery-e2e-classpath.txt
```

Desde frontend, con Docker, Java, Node, Chromium y OpenSSL disponibles:

```text
npm run check:recovery-success-real
npm run test:recovery-success-real
```

En Windows se usó STORECORE_UA_OPENSSL apuntando al OpenSSL instalado de Git.
Los archivos locales ignorados están en frontend/recovery-real-results/.
El workflow prepara el test-classpath explícitamente y ejecuta el success runner
después de la matriz UA existente, con su propio PostgreSQL desechable.

## Límites

La prueba acredita el core local y el flujo Angular real con email capturado en
memoria. La prueba UNCONFIGURED/503 sigue separada. No hay proveedor SMTP/API,
outbox real, credenciales live, release ni habilitación de homologación.
