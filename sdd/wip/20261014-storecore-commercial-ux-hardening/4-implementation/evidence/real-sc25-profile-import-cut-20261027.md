# SC-SURF-25 — corte Real 2026-10-27

Base: `a269f9afd236786617520d2453f7189c0cd0343d`. Árbol propietario: `split-worktrees/storecore-master-profile-import`. Sin PR, merge ni deploy en este corte.

## Contrato y alcance vigentes

Sólo `/user/profile-import` y `content.homeSections`. Configuración general, export y reset Demo quedan fuera. Implementación GO provisional según `meta.md`; el gate visual Stitch histórico sigue separado y abierto.

Backend inspeccionado: `JdbcProfileService`, máximo 100 secciones y 20.000 bytes de JSON serializado por `content`. Preview devuelve `diff` como texto JSON array; merge devuelve texto JSON `{changes: [...]}`. La frontera frontend traduce ambos, operaciones desconocidas permanecen Unknown y bloquean confirmación. El cliente valida JSON, claves, selección y límites con tipos más estrictos que las coerciones actuales del backend; servidor sigue siendo autoridad de nombre, versión, compatibilidad y permisos. No se modifica backend.

La selección se construye como `mergeSelection.homeSections` en el texto del editor, invalida la aprobación previa y exige otra preview de ese texto exacto. Merge envía ese mismo texto. No hay hash, previewId, CAS, reserva del contenido ni idempotencia servidor. La confirmación informa la posibilidad de cambios concurrentes.

Los estados cerrados son Editing, Previewing, Reviewing, Confirming, Merging, Succeeded, Failed, ResultUncertain, AccessDenied y Unknown, más PreviewValidity y ProfileCompatibility. Actor/roles, generación y bloqueo de fase protegen respuestas tardías y doble dispatch. 401/403 limpian datos privados. Error conocido conserva borrador con acceso vigente y exige nueva preview; red, timeout, 5xx o respuesta merge no verificable producen resultado incierto y bloquean merge hasta una revisión explícita: el CTA consulta preview conservando fuente/selección y luego exige nueva confirmación, sin retry automático.

JSON se representa como texto interpolado. La detección preventiva de patrones sensibles considera JSON decodificado, rechaza manifiestos y descarta diffs completos sospechosos; no promete detectar todos los secretos. No se guardan borradores en almacenamiento persistente.

## Validación del corte

- `npm run verify`: PASS, ejecución final 2026-10-27 19:15 UTC; arquitectura 6/6, ESLint PASS, 68 archivos / 399 tests PASS, build producción PASS (597,21 kB inicial raw / 132,78 kB transferencia estimada).
- Playwright propietario `npx playwright test e2e/admin-profile-import.spec.ts --workers=1`: PASS 8/8, ejecución final 19:16 UTC. Cuatro recorridos completos preview → selección → repreview → cancel/Escape/foco → confirm → merge a 320/390/768/1440 CSS px; assert de texto exacto y un único POST; snapshots renderizados como texto; teclado/ciclo de foco/restauración; axe sin serious/critical y sin overflow horizontal en esos viewports. Cuatro escenarios adicionales cubren incompatible/malformed/Unknown/diff sensible, fallo conocido + recuperación incierta sólo preview —incluido HTTP 200 con JSON ilegible— + 403, Operator directo sin llamadas, doble click y cambio de actor con respuesta tardía descartada. El cambio de actor browser usa el signal real de sesión mediante API debug Angular en desarrollo; no simula una autenticación live.
- Capturas de revisión y diálogo: `frontend/test-results/admin-profile-import-profi-9e5d8-board-axe-and-reflow-at-320/sc25-{review,confirm}-320.png`; `admin-profile-import-profi-28b25-board-axe-and-reflow-at-390/sc25-{review,confirm}-390.png`; `admin-profile-import-profi-c52d8-board-axe-and-reflow-at-768/sc25-{review,confirm}-768.png`; `admin-profile-import-profi-c5a5d-oard-axe-and-reflow-at-1440/sc25-{review,confirm}-1440.png` (todas bajo `frontend/test-results/`, outputs locales ignorados por Git). Inspección visual manual de review 390 y 1440 realizada; paneles apilados en mobile, columnas completas en desktop, claves de 80 caracteres envuelven sin desbordar.
- Pruebas unitarias específicas: clases cerradas/traductores, límite 100/101, UTF-8 20.000 bytes sobre contenido entrante, snapshot anterior autoritativo mayor a ese límite, tipos/metadatos/claves, escapes sensibles, ambos envelopes, snapshots y versiones malformadas, selección/texto exacto, confirm/cancel, duplicados, 401/403, timeouts, actor/destroy, errores conocidos y resultado incierto —incluido HTTP 2xx con JSON ilegible después del merge—. Mapper HTTP rechaza `compatible` ausente/null/string/número; no coerciona hacia Incompatible. Repositorio verifica POST con texto intacto para ambos endpoints.
- La primera ejecución sandbox falló al resolver archivos Angular/esbuild por acceso denegado; las ejecuciones finales completas se realizaron con escalación autorizada. Primera ronda browser detectó ciclo inverso de foco que salía al chrome del navegador; se añadió contención de Tab/Shift+Tab al diálogo y los 8 escenarios finales pasaron.
- Backend real/PostgreSQL/browser con servidor vivo: NOT_RUN. Los E2E HTTP interceptados validan el frontend real y su contrato, no persistencia backend.
- Stitch externo / review final dual / CI exact-head: NOT_RUN.

Gate documental del reviewer de spec Astra: APPROVE, 0 P1/P2 documentales, tras reconciliar contrato y recuperación incierta. No equivale a review final de código. Se compartió resumen técnico/UX con el planner Astra para contraste.

Las afirmaciones históricas 200 secciones, 1 MB y certificación del árbol previo no aplican. No se certifica WCAG completa; se registran sólo axe, teclado y reflow efectivamente ensayados.
