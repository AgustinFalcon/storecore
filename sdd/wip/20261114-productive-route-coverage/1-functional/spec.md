# Spec funcional

## Reglas

- Toda ruta leaf concreta del router productivo aparece exactamente una vez en
  el manifiesto de aceptación.
- Redirects y wildcards se censan por separado y también se reconcilian.
- Cada pantalla concreta declara patrón, URL navegable, identidad de superficie,
  actor, escenario, heading y condición de datos listos.
- Las rutas dinámicas usan identidades de fixture estables y prueban que la
  pantalla renderiza ese recurso, no sólo un estado “no encontrado”.
- Las rutas protegidas se aceptan con sesión válida; la redirección anónima es
  una prueba adicional y no reemplaza la pantalla autenticada.
- Axe bloquea violaciones `serious` y `critical`.

## Evidencia

El modo de esta suite es `HTTP_FIXTURE`: acredita Angular productivo y su
contrato HTTP, no Spring/PostgreSQL. Los journeys reales se citan por separado.
