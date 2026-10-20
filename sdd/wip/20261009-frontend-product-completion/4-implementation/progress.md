# Evidencia inicial

2026-10-09: inspección estática de `db377fa` y documentación de FE-COMP-01..06. No se ejecutó producto, no hay nuevos resultados browser/build/CI ni revisión aprobada. Implementación: pendiente. Gates G-D/T/B/U/R: `NOT_RUN` salvo validación estructural documental que se registre explícitamente tras ejecutarla.

Validación documental local 2026-10-09: `tasks.json` parseado con PowerShell `ConvertFrom-Json`; seis IDs únicos, dependencias existentes ordenadas sin ciclos y los 16 criterios de aceptación referidos presentes en el spec funcional: PASS. Este check de estructura no aprueba G-D ni acredita comportamiento del producto.

Por cada escenario guardar: corte/criterio, SHA, fixture/reset, rol, ruta/tab/CTA, precondición, acción, efecto y datos esperados/obtenidos, viewport, comando/fecha, captura/traza y resultado PASS/FAIL/NOT_RUN. Conteo de clicks separado de cobertura de requisitos. Pérdida de datos, estado incorrecto, control sin efecto o aislamiento roto son fallo aunque el browser test no crashee.

El trabajo backend previo no se retoma en este WIP. Su handoff y gates permanecen en el worktree `storecore-int-fe04-commerce-backend`; el frontend simulado no los cierra. Revisar estado/commit allí antes de continuar backend.

2026-10-13: se registró el GO documental limitado de GPT-6.1 Sol en
`sdd/reviews/20261013-sol-go-fe-comp-02.md` y el contrato de propiedad,
inventario, migración y conflicto de pestañas en
`4-implementation/fe-comp-01-fe-comp-02-contract.md`. FE-COMP-01 y FE-COMP-02
están `in_progress`; ninguno está aceptado. Sin evidencia browser/build/test nueva
todavía.

2026-10-14: FE-COMP-02 implementa en el demo local `variantId` estable, precio,
stock y reserva por variante; carrito por `sku + variantId`; snapshots de pedido
con nombre/variante/atributos/media/precio; editor de dos variantes y dos medios
con alt; y rechazo explícito de snapshots v1 sin identidad suficiente. Validación
estática: `tsc -p tsconfig.app.json --noEmit` PASS, `tsc -p tsconfig.spec.json
--noEmit` PASS y `npm run lint` PASS. `npm run check:architecture` PASS.

El runner Angular de `npm run build`/`npm test` queda temporalmente bloqueado en
este worktree por `Cannot read directory ../../../../../../..: Acceso denegado`
y posteriores `Could not resolve` de archivos que existen; no se acredita build,
tests browser ni G-B/G-U/R. Se instalaron dependencias desde el lockfile con una
cache local porque inicialmente no había `node_modules`; el audit informó una
vulnerabilidad alta preexistente en dependencias, sin `audit fix` ni cambio de
lockfile. Falta evidencia J02 y revisión independiente posterior.

2026-10-14: se agregó la cotización explícita del carrito por `sku + variantId`.
Si una campaña, edición de producto o ajuste de stock cambia el precio o deja una
cantidad no disponible, `DemoCommerce.checkout` rechaza la compra hasta que el
cliente confirme el resumen actualizado. La UI expone ese estado tanto en carrito
como en revisión de checkout; el pedido conserva el precio confirmado. El schema
local pasó a v3 y un snapshot v2 se rechaza de forma explícita para restablecer la
demo, en vez de inferir una cotización inexistente. También se evita un total
`Infinity` cuando un producto queda sin variantes activas.

Validación de este corte: `tsc -p tsconfig.app.json --noEmit` PASS, `tsc -p
tsconfig.spec.json --noEmit` PASS, `npm run lint` PASS y `npm run
check:architecture` PASS. La ejecución directa de `npx vitest run
src/app/demo/demo-model.spec.ts --environment node` es `NOT_APPLICABLE`: esta
suite usa los globals del runner Angular/Jasmine y Vitest informa `describe is not
defined`. No se toma como test funcional ni como gate aprobado. G-B/G-U/R siguen
`NOT_RUN` hasta ejecutar el runner Angular en un entorno que pueda resolver el
workspace y una verificación browser de J02.

Control SDD-kit: se intentó `validate-spec-conflicts.sh` en modo advisory. La
instalación local no puede cargar `tools/shared/validator-utils.sh` (el helper no
está distribuido; el script además contiene BOM). Resultado `BLOCKED_TOOLING`, no
PASS. Se conserva el WIP y sus contratos; no se simula un check de SDD-kit.

2026-10-14: corte de acceso demo: agregar al carrito/favoritos conserva una
`returnUrl` interna validada; login no usa fallback de actor para emails
desconocidos; registro rechaza email ya existente. Validación estática del corte:
TypeScript app/spec, lint y arquitectura PASS. G-B/G-U/R continúan `NOT_RUN`.

2026-10-14: inventario deja de ajustar implícitamente la primera variante. La UI
exige variante activa, el movimiento conserva `variantId` y la prueba de dominio
verifica que la variante hermana no cambia. Snapshot demo v4 rechazó estados
anteriores sin identidad de movimiento.

2026-10-14: FE-COMP-03 pasa a `in_progress`. Se incorporaron estados cerrados de
solicitud y disposición, líneas parciales por variante, cancelación de cliente,
decisión admin, recepción, inspección, reposición única y reembolso simulado
separado del gasto de envío. La pantalla de pedido expone el historial y las
acciones válidas por estado; el formulario limita cantidades por línea. Snapshot
demo v5. TypeScript app/spec, lint y arquitectura PASS. `build:demo` sigue
bloqueado exclusivamente por la lectura denegada/resolución del worktree ya
registrada; en esta corrida no apareció diagnóstico adicional de template.

2026-10-14: FE-COMP-04 inicia fulfillment diferenciado. Retiro usa el estado
cerrado `ReadyPickup`, no genera tracking postal y finaliza como entrega en
mostrador; domicilio conserva despacho y tracking simulado. El detalle de pedido
ahora muestra media congelada, variante, atributos, cantidad, precio unitario y
subtotal con clave `sku + variantId`, y el CTA administrativo deriva de la
modalidad. Se eliminó de la pantalla la acción legacy `returned` en favor del
flujo de solicitudes. Evidencia ejecutable adicional: `npx vitest run --globals
src/app/demo/demo-model.spec.ts src/app/demo/demo-state.spec.ts --environment
jsdom` PASS, 2 archivos / 16 tests.

2026-10-14: se confirmó que el bloqueo del runner Angular era aislamiento del
sandbox y no configuración del proyecto. Ejecutado fuera de esa restricción,
`npm run build:demo` PASS y generó `dist/storecore-demo`. La suite browser
confirmó las rutas declaradas, compra→inventario→fulfillment, edición
admin→tienda→ML, y responsive 390/768/1440. Se actualizaron expectativas E2E al
contrato estable `sku + variantId`; regresiones de carrito, cantidades inválidas,
navegación entre SKU y producto archivado: 3/3 PASS. La matriz total aún no se
marca PASS hasta finalizar su migración del flujo legacy de devolución.

2026-10-14: FE-COMP-02 agrega galería de todos los medios, miniaturas, selección
con `aria-pressed`, foco visible y zoom modal accesible. El editor admin permite
atributos, medios/alt y variantes con precio/stock, además de vista previa. Build,
TypeScript, lint y arquitectura PASS.

2026-10-14: FE-COMP-05 pasa a `in_progress`. La entrada única usa perfiles con
rol cerrado: `cliente@demo.invalid`, `cliente2@demo.invalid` y
`admin@demo.invalid`; ya no permite que un comprador elija administración. La
intención interna segura se conserva para comprador. Se agregó recuperación
neutral simulada con estados cerrado solicitado/vencido/utilizado y registro con
rol comprador explícito. Snapshot v6 y luego migrado por los cortes siguientes.

2026-10-14: FE-COMP-06 pasa a `in_progress`. La conexión ML dejó de ser booleana:
desconectada/autorizada/vencida/error/pausada/Unknown son estados cerrados con
acción y última actividad. Listing registra identidad externa, variante local,
fecha y conflicto de mapping que requiere resolución manual. Competencia guarda
fuente, seller, confianza, frescura, umbral e historial; leer ya no resuelve una
alerta. El snapshot llegó a v8 al sumar inbox persistente para pagos/incidencias,
estados nueva/leída/resuelta y preferencias por tipo sin borrar historial.
Validación de dominio actual: 3 archivos / 23 tests PASS; app/spec TypeScript y
lint PASS. Falta repetir matriz E2E completa y revisión visual final para cerrar
G-B/G-U/R.

2026-10-14: cierre de implementación local FE-COMP-01..06. Se eliminó la
autoridad legacy `DemoOrder.returned`; postventa queda gobernada únicamente por
solicitudes y estados cerrados. Administración incorpora búsqueda, estado,
orden, vacíos y límites explícitos para pedidos/postventa, productos, inventario,
campañas y contenido. Los enlaces del dashboard abren listas con filtros
coherentes. La bandeja persistente distingue alerta nueva, leída y resuelta.

La matriz de CTA mide responsabilidades dinámicas (por ejemplo devolver,
resolver alerta o editar campaña) sin convertir UUIDs de fixtures en acciones
distintas. Todos los controles visibles y habilitados tienen un escenario; los
deshabilitados conservan razón visible. Se añadieron escenarios de cotización
obsoleta tanto en carrito como en checkout, filtros administrativos, estados
vacíos, edición avanzada, devolución completa y navegación por alertas.

Evidencia final local:

- `npm run test:demo`: PASS, 25/25 escenarios Playwright, 2026-10-14. Incluye
  J02..J06, matriz comprador→admin→comprador, aislamiento de actores, recarga,
  errores deterministas, no llamadas `/api`, responsive 390/768/1440 y Axe sin
  violaciones en la portada.
- `npm run verify`: PASS. Arquitectura 6/6, ESLint PASS, Angular/Vitest 74
  archivos y 308 pruebas PASS, build productivo PASS. Artefacto:
  `frontend/dist/storecore-frontend`.
- `npm run build:demo`: PASS. Artefacto: `frontend/dist/storecore-demo`.
- Inspección visual manual sobre capturas de portada, PDP, dashboard, catálogo,
  pedidos, inventario, ML y configuración en 390/768/1440: sin P1/P2 locales.
  El overflow introducido por tarjetas relacionadas en 390 fue detectado por la
  suite, corregido a una columna y revalidado: PASS.
- El shell separa storefront y backoffice, cierra menú móvil por navegación o
  Escape, mueve foco al contenido tras navegación y marca el paso actual de
  checkout. PDP relacionado muestra imagen, marca, precio y stock.

Estado: las seis tareas están implementadas y aprobadas localmente. G-U requiere
todavía la re-revisión independiente sobre el SHA final y G-R requiere CI del PR;
ambos se ejecutarán en la etapa de PR que el usuario pidió tratar después. No se
declara merge-ready ni homologación real. El validador distribuido de SDD-kit
sigue `BLOCKED_TOOLING` por ausencia de `tools/shared/validator-utils.sh`; no se
falsea ese resultado.

2026-10-20: promoción documental limpia sobre `master` `95e0c88383e57dd80747b8de50fc00629bd90494`. Se preservan specs funcionales/técnicos, tareas, manifiestos, briefs y evidencia textual; las capturas PNG regenerables se excluyen para evitar rutas Windows no portables y peso binario innecesario. El backup local recuperable queda fuera del PR. Esta promoción no atribuye los gates históricos al SHA nuevo: requiere review exact-head y CI del PR antes de mergear.
