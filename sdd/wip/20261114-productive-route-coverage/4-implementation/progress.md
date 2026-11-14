# Progreso

## 2026-11-14

- El issue conserva “24” como cifra histórica; el árbol actual contiene más
  rutas concretas, redirects y wildcards.
- El gate PSD archivado no es un censo exhaustivo y no se modifica.
- La revisión recomendó un manifiesto nuevo por patrón de ruta, con evidencia
  `HTTP_FIXTURE` explícita y asociación separada a journeys reales.
- Se declararon 29 leaves concretos, cuatro redirects y tres wildcards; el test
  de arquitectura reconcilia los conjuntos exactamente y sin un número fijo.
- El fixture central responde sólo lecturas declaradas, permite las inspecciones
  públicas de recovery/verificación y registra cualquier request inesperado o
  mutación para hacer fallar la aceptación.
- La primera pasada de 58 casos descubrió problemas reales: enlace visual de
  favoritos sin nombre accesible, contraste insuficiente del breadcrumb de PDP
  y overflow horizontal del catálogo operador móvil. Los tres se corrigieron.
- Evidencia local final:
  - `npm run verify`: arquitectura 9/9, lint, 207 archivos y 1403 tests, build.
  - `npx playwright test e2e/productive-route-coverage.spec.ts`: 59/59
    (58 aceptaciones de ruta y una regresión de red fail-closed).
  - `npm run test:a11y`: 155/155.
  - `git diff --check`: limpio.
- Tras la primera revisión estricta se agregó `Unknown` a todos los tipos
  cerrados, rechazo explícito de `loadChildren` y bloqueo global de tráfico
  desconocido, incluidas otras versiones de API, otros orígenes y escrituras
  `sendBeacon`; sólo se permiten documentos/assets GET del origen local.
- Bugbot y Security Review revalidaron el diff final y emitieron `APPROVE`, sin
  hallazgos P0-P3.
- Ninguna de estas cifras se presenta como evidencia de backend real.
