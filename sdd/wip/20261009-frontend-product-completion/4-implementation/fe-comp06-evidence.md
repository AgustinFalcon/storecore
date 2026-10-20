# FE-COMP-06 — marketplace y competencia de muestra

## Addendum de correcciones tras revisión — 2026-10-20

Las revisiones de producto y seguridad sobre `8018ce3` emitieron NO-GO con seis
P2. Se corrigieron antes de solicitar una nueva revisión; aquel SHA y sus gates
anteriores no representan aprobación del árbol corregido.

1. Venta de dominio exige variante explícita, aun con un solo mapping. El
   adaptador legacy solo traduce ID omitido con exactamente un candidato
   elegible. Dos mappings ya no permiten elegir silenciosamente el primero.
2. Disponibilidad de observaciones cambia mediante comando y regla en el tipo
   cerrado. Origen/destino Unknown bloquean sin sobrescribirlos; la UI deriva
   habilitación de esa regla, incluso para renovar/repetir muestras.
3. Unlink valida cuenta Unknown antes de cambiar vínculo o superseder cola; el
   formulario y los controles derivados también quedan deshabilitados.
4. Repetir venta exige un evento real previo. Sin historial no ejecuta comandos
   ni inventa una operación initial; el control está deshabilitado. Con evento,
   el replay conserva el snapshot completo, incluida revisión.
5. Traductor legacy v1/v4 agrega variante SKU:standard únicamente a movimientos
   históricos ML con razón conocida y delta -1. Replay posterior no consume otra
   unidad ni acepta reutilizar la operación para otro SKU. Los ajustes manuales
   no reciben identidad ML.
6. Al crear una alerta de competencia, inbox toma la lectura persistida de la
   señal, sin resolverla. Se prueba la secuencia preferencias pausadas → señal
   leída → reload → preferencias activas → alerta Read/Active única.

Verificación del árbol corregido: focal **5 suites / 66 pruebas PASS**;
full **87 suites / 406 pruebas PASS**; TypeScript app/spec, lint, arquitectura
(6 pruebas + scan), demo (2.21 MB) y producción (552.34 kB) PASS. Browser afectado:
**6/6 PASS en 20.8 segundos** (cuatro C06 y dos regresiones nuevas), con ledger
de 17 familias completo, axe sin violaciones y sin overflow en 15 combinaciones.
Reporte local ignorado `frontend/demo-playwright-report/pr190-review-fixes-6-20261020.json`.
El full browser 35/35 documentado debajo es anterior a estas seis correcciones;
no se atribuye una nueva ejecución full browser al árbol corregido. Las nuevas
regresiones unitarias son siete de dominio y dos de componente. Junction temporal
#188 retirada al terminar, sin borrar su destino. Nueva review y CI pendientes;
no se declara APPROVED, merge ni push.

## Evidencia previa del rebase

Evidencia local actualizada el 2026-10-20 para el rebase de #190. Origen
`76aea78126e181540c2fdf7b0b3d0b66b48f4f72`, base anterior `78289cee`,
base nueva exacta #189 `00a48385ee76cf01f710d2ae8eb6bbfda88cc664`.
Backup local `refs/codex/backup/pr190-pre-rebase-20261020` conserva el origen.
Esta evidencia reemplaza los conteos del árbol previo al rebase; no representa
review independiente, CI, merge, release, homologación ni activación externa.

## Alcance y resolución

Se conservan los módulos aislados de catálogo/checkout #187 y posventa/precios
#188, y los fixes de fulfillment/inbox #189. Sus specs monolíticos eliminados no
se restauran. El runtime actual conserva su inventario legacy y el punto de
retiro completo congelado por #189. No se incorporan access/admin, nuevas
sesiones ni composición de runtime de #191.

El módulo marketplace acepta el catálogo modular mediante
`DemoMarketplaceSnapshot` y `DemoCatalogQuery`: disponibilidad descuenta reservas
y unidades no vendibles y respeta Unknown/publicación/estado de venta. El
adaptador legacy expone una sola identidad `SKU:standard` por SKU. La UI actual
no demuestra compra/admin multivariante; esa composición continúa pendiente en
#191. Ver `frontend/src/app/demo/marketplace-INTEGRATION.md`.

E06.1: cuenta y recuperación, mapping explícito SKU/variante a identidades SIM,
conflictos, desvinculación y Unknown cerrado. Identidades de mapping y validación
persistida usan pares SKU/variante inequívocos, incluso si los datos contienen
guiones o dos puntos o distintos productos reutilizan un ID de variante.

E06.2: pasos separados de proyección, mapping, respuesta simulada y venta por
puerto. Deuda, generaciones, fallos, intentos, observado/confirmado y replay
idempotente permanecen. Pruebas de dominio cubren stock modular por variante,
reservas/no vendible, cuenta pausada/vencida/error, agotamiento y replay de venta.
El puerto de consumo conserva la propiedad del inventario en catálogo; no
introduce autorización de aplicación en este corte.

E06.3: observación fechada read-only, fuente fixture, frescura cerrada,
umbral/historial/replay y señales con lectura independiente de resolución. La UI
de competencia no cambia el precio propio. El inbox conserva los fixes #189 y
proyecta las señales de este módulo.

El borde demo migra snapshots legacy v1/v4 a v5 y exige marketplace en v5.
`decodeMarketplace` restaura los casos canónicos y valida cantidades, fechas,
mappings/colas y observaciones. No se reivindica migración v2/v3 en esta rama.

## Verificación local

- Focal final: 4 suites, 57/57 pruebas PASS (marketplace, procesos/stock,
  fulfillment/inbox y modelo legacy).
- Suite completa final: 86 suites, 397/397 pruebas PASS.
- TypeScript `tsconfig.app.json` y `tsconfig.spec.json` con `--noEmit`: PASS.
- ESLint: PASS. Arquitectura: 6/6 pruebas de frontera y scan PASS.
- Build demo: PASS, 2.20 MB desarrollo. Build producción HTTP: PASS, 552.34 kB.
- Browser full: 35/35 PASS, 2.7 minutos, con CTA matrix legacy y fulfillment/inbox
  #189. Reporte local ignorado
  `frontend/demo-playwright-report/pr190-full-35-20261020.json`.
- Después del full se recompiló únicamente el ajuste que mantiene la revisión
  persistida intacta ante replay de venta ML; focal final 57/57 y suite final
  397/397 lo cubren. C06 browser final: 4/4 PASS en 14.5 segundos, 17 familias
  CTA ejecutadas sin pendientes, axe sin violaciones y sin overflow en los cinco
  tabs por 390/768/1440. Reporte final `frontend/demo-playwright-report/results.json`;
  15 screenshots en `frontend/test-results/marketplace-completion-com-057d1-s-responsive-and-accessible/`.
- node_modules se reutilizó desde #188 por junction temporal con destino
  inspeccionado; se retiró al terminar y se verificó que el destino sigue
  existiendo. No se instalaron ni copiaron dependencias.
- La primera ejecución Angular dentro del sandbox falló por lectura ancestral
  denegada de esbuild; las ejecuciones posteriores fuera del sandbox autorizado
  pasaron. No se interpreta ese error de entorno como fallo del producto.
- Una corrida browser anterior dio 33/35: se recompilaron IDs de mapping mientras
  Playwright conservaba selectores anteriores y el ledger falló en cascada. Se
  repitió la corrida completa con bundle/specs inmóviles: 35/35. No se presenta
  aquella corrida intermedia como PASS.

Residual: composición buyer/admin multivariante #191, review independiente y CI.
Los estados heredados de otras tareas en tasks.json no reciben nueva aceptación
funcional global por esta evidencia. No hay OAuth, dispatcher ML, red externa,
scraping, cambios remotos de precios, proveedores reales ni PASS de producción.
