# Progreso

> **Estado de promoción:** este diario conserva resultados de un árbol de
> integración anterior que fue dividido en cortes pequeños. No prueba que el
> código descrito exista en el PR #195. La procedencia recuperable se registra en
> `evidence/historical-provenance.md`; toda entrada sin SHA o snapshot verificable
> es `UNKNOWN/UNVERIFIED`, histórica y no certificante. El estado ejecutable
> vigente es el de `../3-tasks/tasks.json` y cada corte debe repetir tests, review
> y CI sobre su SHA final.

2026-10-14: WIP abierto desde `1d510e9`. Tres revisiones independientes no
detectan P1 y coinciden en P2 de PDP, continuidad catálogo, navegación móvil,
paginación y producto simple. Comparación browser confirma que Compra Gamer hace
visibles búsqueda/categorías/outlet/ayuda/posventa y que Mercado Libre prioriza
destino/entrega/pago/seguridad. Stitch propone una composición StoreCore sobria;
se descartan sus datos comerciales inventados y se conserva sólo el patrón.

2026-10-14: Implementación funcional terminada. El catálogo conserva búsqueda,
filtros, orden y página en la URL; su vacío tiene recuperación explícita. El PDP
expone variante, precio, stock, entrega, retiro, medios de pago, garantía,
postventa y ayuda pública. La portada incorpora contenido público de compra,
envíos, devoluciones y un contacto local simulado. Producto simple acepta una
variante y una imagen. Los listados administrativos usan paginación acotada por
un objeto `DemoPagination` con regresión para filtros que reducen el total.

Se reemplazaron las siluetas por doce fotografías de producto locales,
consistentes y sin marcas, generadas para esta demostración y optimizadas a
800 px. La navegación administrativa y los filtros se adaptan a 390/768/1440.

Evidencia local final antes del review independiente:

- arquitectura: 6/6;
- lint: PASS;
- unitarias: 75 archivos, 311 tests PASS;
- build producción y demo: PASS;
- matriz CTA: 8/8 PASS;
- recorridos comerciales y responsive: 17/17 PASS;
- red externa/API durante la demo: bloqueada por prueba.

CI remoto queda deliberadamente pendiente hasta armar el PR; no invalida los
gates locales de este corte.

2026-10-14: Segundo ciclo de review cerrado. UI detectó densidad excesiva en
home mobile y una fila incompleta en desktop; PO detectó divergencia entre la
página efectiva y su etiqueta después de filtrar. Se compactó hero, beneficios
y categorías en mobile, se usaron cuatro columnas para cuatro destacados en
desktop y se unificó la paginación sobre índices efectivos con reinicio por
filtro y orden. Axe responsive 390/768/1440 pasa 3/3.

Resultado independiente final: UX competitivo APPROVE, UI visual APPROVE y
Product Owner APPROVE. No quedan P1/P2 dentro del alcance frontend demo. El
gate de CI remoto permanece pendiente de la futura creación del PR.

2026-10-14: gate reabierto por criterio comercial más estricto. La evidencia
visual demostró que los recorridos funcionaban, pero el seed inicial ocultaba
la mayor parte del producto: tres pedidos aprobados, devoluciones/movimientos/
alertas vacíos, una campaña y ninguna actividad de canal. UX, UI y Product
Owner coinciden en CHANGES_REQUESTED P2. Se agrega un escenario “Comercio en
operación” con datos correlacionados y se revalidarán composición, responsive,
acciones y consistencia antes de volver a declarar completitud.

2026-10-14: tercer ciclo cerrado. El seed comercial sube a versión 9 para
invalidar automáticamente snapshots pobres guardados en el navegador. Incluye
doce pedidos con pagos/entregas variados, cuatro devoluciones, seis campañas,
ocho movimientos, cuatro operaciones de sincronización, tres competidores,
cuatro alertas, dos direcciones por cliente y contenido público completo. Las
fichas de producto tienen descripción y especificaciones propias sin simular
una galería duplicada.

Se corrigieron los P2 finales: aprobar un pago pendiente ahora mueve el envío
a preparación y permite completar despacho/entrega; rechazarlo cancela también
el envío; un retiro no recibe tracking postal. Campañas no vigentes muestran el
precio proyectado y lo distinguen del descuento aplicado. Contenido incorpora
una vista previa real de la tienda; módulos y configuración comunican estado y
valor comercial antes de exponer herramientas técnicas.

Evidencia final:

- `npm run verify`: arquitectura 6/6, lint PASS, 75 archivos y 312 tests PASS,
  build producción PASS;
- matriz de CTA y recorridos: 8/8 PASS;
- regresión comercial: 11/11 PASS;
- regresión visual/estado: 6/6 PASS;
- set responsive definitivo: 3/3 PASS y 60 PNG generados en la corrida original
  (20 superficies por 390/768/1440). La promoción limpia conserva manifiestos
  y evidencia textual; los binarios regenerables no se versionan en este corte;
- UI visual APPROVE, UX competitivo APPROVE y Product Owner APPROVE, sin P1/P2
  reproducibles pendientes.

Todos los gates locales del frontend demo están cerrados. CI remoto continúa
`PENDING_PR` por decisión de secuencia: el PR se arma en la etapa siguiente.

2026-10-14: una auditoría posterior más estricta invalida la declaración de
completitud precedente. `npm run test:demo` ejecutó 24/25 coberturas declaradas;
`gallery-DEMO-13-media-2` quedó renderizada pero no ejercitada. La evidencia
preservada cubre 20 superficies por tres viewports, no el inventario completo.
UI, UX y Product Owner reabren el gate por un P1 de persistencia del editor y
P2 de coherencia transversal.

Se aprueba planificar por SDD antes de volver a tocar código. El objetivo pasa
a 26 superficies, agrega Administración de clientes, separa demo/rutas reales/
integración/homologación y exige dos rondas de triple review: prototipos antes
de implementar y aplicación ejecutable al finalizar. UXH-01..UXH-10 quedan
como historial superado; `tasks.json` se regenerará tras aprobar los specs.

2026-10-14: review de specs completado sobre los archivos exactos. Primer ciclo
detectó P2 en evidencia responsive, WCAG, matriz de medios de pago, fórmula de
inventario, política de precio, ubicación de módulos futuros y precedencia SDD.
Todos fueron corregidos. Segundo ciclo: UI APPROVE, UX competitivo APPROVE y
Product Owner APPROVE, sin P1/P2 contractuales pendientes. Los specs esperan
aprobación humana antes de regenerar `tasks.json`; implementación sigue bloqueada
hasta diseñar las 26 superficies en Stitch y obtener el triple APPROVE de diseño.

2026-10-14: Agustin Falcon aprueba el spec funcional y técnico para avanzar al
plan. Antes de generar tareas, dos reviewers senior Angular/TypeScript independientes
detectan ambigüedades P1/P2 de alcance demo/productivo, arquitectura monolítica,
persistencia e inventario. Se incorporan sus mejoras: manifiesto versionado de 26
superficies, contratos HTTP exclusivos en producción, extracción SOLID mediante
presenters/use cases/policies/step objects, mutaciones transaccionales y validación
WCAG 2.2 con reflow a 320 CSS px. Se repite el review senior sobre los archivos
enmendados antes de abrir el gate de planificación.

2026-10-14: segundo ciclo senior finaliza con SENIOR_ARCHITECT APPROVE y
SENIOR_DELIVERY APPROVE. Se corrigieron tres rutas demo, se registraron 24
`productiveBindings` verificables y se limitaron favoritos, dashboard e inventario
a sus contratos realmente existentes. El validador SDD-kit no detecta conflictos.

Se genera `3-tasks/tasks.json` con 24 tareas y estrategia batched: 21 de trabajo
local/diseño y exactamente 3 gates de calidad. El grafo no tiene IDs duplicados,
dependencias huérfanas ni ciclos; toda modificación de código depende
transitivamente de TASK-004 (triple APPROVE de diseño). La implementación continúa
bloqueada hasta aprobación humana del plan y cierre del gate de diseño.

2026-10-14: el primer review del grafo detecta dos P2: trazabilidad E2E incorrecta
y riesgo de aprobar evidencia de un SHA previo. Se reasignan E2E-01..12 a sus
tareas canónicas. TASK-022/023/024 quedan como reviews no mutantes del mismo SHA
certificado por TASK-021; cualquier hallazgo invalida los tres y reabre productor y
certificación. Re-review final: ambos seniors APPROVE, sin P1/P2 del plan.

2026-10-14: Agustin Falcon aprueba el plan completo y autoriza avanzar. Estrategia
batched seleccionada. Se inicia TASK-001; Angular permanece bloqueado hasta cerrar
TASK-004 con triple APPROVE del diseño Stitch.

## 2026-10-15 — Stitch capacity checkpoint

- `SC-SURF-21A` R6.4 is approved by both coordinated GPT-6.1 Astra reviewers with `0 P1 / 0 P2`.
- `SC-SURF-21B` remains `CHANGES_REQUESTED — 0 P1 / 6 P2`.
- A surgical B edit timed out and produced no confirmed artifact. A subsequent fresh immutable generation was rejected before creation with `Resource has been exhausted`; no screen ID or false approval was recorded.
- The deterministic replacement brief and binary gate are saved in `4-implementation/design/sc21b-r6.2-brief.md`.
- Read-only source audit confirms the existing frontend already contains multiple closed TypeScript domain types with private constructors, static instances, `fromWire` and `Unknown`. Existing local frontend changes are preserved and remain outside this design-only iteration.
- `TASK-003` remains in progress, `TASK-004` remains pending and no new modification under `frontend/src` is authorized until `DESIGN=APPROVED`.

## 2026-10-15 — SC-SURF-23 deterministic correction brief

- Two coordinated GPT-6.1 Astra gates (modern UI and product/UX) reconciled the nine residual P2 groups without discrepancies.
- The immutable R6.1 generation contract is recorded in `4-implementation/design/sc23-r6.1-brief.md`.
- Unsupported cost/margin, seller, account, evidence and event details were intentionally excluded; missing facts remain explicit rather than inferred.
- No Stitch artifact was generated while connector capacity was exhausted, no surface was approved, and Angular remains gated by TASK-004.

## 2026-10-15 — SC-SURF-24 fixture closure and correction brief

- Coordinated Astra review found a real SDD inconsistency: seven capability cards were required but only six were frozen, while Mercado Libre lacked a deterministic runtime projection.
- `design-manifest.json` now adds informational Outlet with no productive ID and models operational applicability explicitly. Mercado Libre fails closed as `Unknown` with null version until authoritative data is loaded.
- Both coordinated Astra gates returned `APPROVE_TO_GENERATE — 0 P1 / 0 P2` for the amended contract.
- The generation contract is recorded in `4-implementation/design/sc24-r6.1-brief.md`; visual approval and Angular authorization remain open.

## 2026-10-15 — SC-SURF-25 fixture closure and correction brief

- Coordinated Astra review found that the named profile fixtures did not freeze an exact `homeSections` payload, diff, selection or post-merge projection.
- A neutral isolated fixture derived from the existing server schema now covers exact `UPDATE`, `UNCHANGED` and `ADD` cases and selected-merge non-effects.
- The first amendment incorrectly embedded `expectedOperation` in the server payload; both reviewers raised the same P2. It was moved to separate `expectedDiff` metadata and the payload shape was revalidated.
- Both coordinated Astra gates then returned `APPROVE_TO_GENERATE — 0 P1 / 0 P2`. The contract is recorded in `4-implementation/design/sc25-r6.1-brief.md`; visual approval and Angular authorization remain open.

## 2026-10-15 — SC-SURF-26 deterministic correction brief

- Both coordinated Astra reviewers reconciled the seven residual P2 groups without discrepancies, found no remaining fixture blocker and returned `APPROVE_TO_GENERATE — 0 P1 / 0 P2` on the saved brief.
- The brief freezes the single canonical customer/order relationship, exact account restriction/reactivation effects and explicit cancellation, repetition, failure, Operator and Unknown scenes.
- Unsupported identity, fiscal, security, support and audit claims are forbidden. The generation contract is recorded in `4-implementation/design/sc26-r6.1-brief.md`.
- No visual approval was recorded and Angular remains gated by TASK-004.

## 2026-10-15 — SC-SURF-20 deterministic correction brief

- SC20 was the remaining open surface without a standalone regeneration brief because its A generation timed out and B retained five P2 findings.
- Tracking success/failure/cancel/repeat and concurrent tracking conflict are now frozen as isolated specimens without mutating the canonical ledger.
- Both coordinated Astra gates returned `APPROVE_TO_GENERATE — 0 P1 / 0 P2` for `4-implementation/design/sc20-r6.3-brief.md`.
- A and B still require new immutable Stitch evidence and coordinated visual approval; Angular remains gated.

2026-10-14: TASK-001 DONE. El manifiesto ejecutable cubre 26 superficies, 27
escenarios base, seis combinaciones checkout, todos los estados/diálogos/tabs y
Demo/Real por separado. Cada acción tiene efecto, fixture y política de persistencia;
la evidencia usa caseId único y rechaza colisiones. Dos reviewers senior emiten
APPROVE sin P1/P2. Se habilitan TASK-002 y TASK-003 en Stitch.

## 2026-10-15 — cierre documental de la cola Stitch

- Los dos revisores GPT-6.1 Astra auditaron juntos los briefs guardados de SC21B, SC22 y SC23. Coincidieron sin discrepancias.
- SC22 obtuvo `APPROVE_TO_GENERATE — 0 P1 / 0 P2`.
- SC21B recibió inicialmente un P2 por guards incompletos. El brief ahora exige unidad recibida, inspeccionada, dispuesta y no reintegrada antes del reembolso; añade bloqueo sin efectos, tracking Real aislado con recuperación/conflicto y escenas fiscales explícitamente no productivas. Re-review: `APPROVE_TO_GENERATE — 0 P1 / 0 P2`.
- SC23 recibió inicialmente dos P2: alcance excesivo de la prohibición de `accountRef` y ausencia de fixtures suficientes para éxito de mapping/confianza media-alta. El brief ahora limita `accountRef` a lectura, preserva `accountId:number` en el payload y congela especímenes neutrales aislados sin afirmaciones productivas. Re-review: `APPROVE_TO_GENERATE — 0 P1 / 0 P2`.
- Los siete briefs de regeneración SC20, SC21B y SC22..26 quedan documentalmente listos. SC21A conserva su aprobación visual previa.
- Esto no es aprobación visual: SC20, SC21B y SC22..26 todavía requieren artefactos Stitch inmutables nuevos y doble gate Astra sobre HTML/capturas. La capacidad del conector continúa agotada; no se fabricó evidencia ni se modificó Angular. TASK-004 permanece abierto.

## 2026-10-15 — implementation readiness SC20..26

- Un nuevo intento de generación inmutable para SC-SURF-20A fue rechazado inmediatamente por Stitch con `Resource has been exhausted`; no se creó ni registró ningún screen ID y no se reintentó a ciegas.
- Se auditó de forma read-only la implementación Angular actual contra rutas, puertos, casos de uso, stores y tipos cerrados de SC20..26.
- Se agregó `operator-implementation-readiness.md` con el corte Demo/Real, reutilización, tipos cerrados faltantes, pruebas, accesibilidad y secuencia segura de implementación para cada superficie.
- La revisión senior coordinada de SC20..23 encontró 0 P1 demostrado y P2 concretos en políticas RMA/shipment, guard `PAID_STOCK_REVIEW`, ledger Demo, balance no-vendible, separación inspección/disposición, ciclo ML y aislamiento de mutaciones por actor. Quedaron incorporados al readiness para TASK-005..007.
- La revisión senior coordinada de SC24..26 encontró 0 P1 demostrado y siete P2 de readiness: autoridad OPERATOR, dominio Demo de siete módulos, lifecycle/reconciliación de capability, configuración Demo, diff/selección Real, ausencia de SC26 y respuesta tardía entre actores. Todos quedaron incorporados con criterios de aceptación; ambos revisores reportaron consenso sin discrepancias materiales.
- La auditoría confirma bindings productivos reutilizables para SC20..25. SC26 permanece correctamente Demo-only y requiere una ruta/feature Demo dedicada; no se autoriza una ruta Real ficticia.
- No se modificó `frontend/src`. TASK-003 continúa `in_progress` y TASK-004 continúa `pending` hasta que Stitch permita generar los artefactos y ambos gates Astra aprueben la evidencia visual nueva.
- Validación estática integral: cinco JSON parseables, 24 IDs de tarea sin duplicados ni dependencias huérfanas, siete briefs presentes, siete módulos de capacidades y fixtures SC20/SC24/SC25 coherentes; cero marcadores pendientes.

## 2026-10-15 — implementación provisional autorizada

- Stitch no publica un ETA de reposición de cuota/capacidad; esperar bloquearía trabajo de dominio y comportamiento que ya está definido por specs y briefs aprobados documentalmente.
- Agustin Falcon autorizó continuar con el diseño actual y retomar Stitch cuando vuelva a estar disponible.
- TASK-004 permanece abierto, pero ahora bloquea TASK-019, la certificación visual final y el cierre del feature; TASK-005..018 pueden avanzar como `PROVISIONAL`.
- Se inició TASK-005. Ninguna pantalla SC20..26 puede presentarse como visualmente final hasta completar la regeneración y el triple gate pendiente.

## 2026-10-15 — TASK-005 cerrado; TASK-006 iniciado

- Se preservó la matriz G1 de ocho bloqueos en `evidence/reproductions/README.md`, enlazando pruebas unitarias y E2E existentes sin borrar evidencia histórica.
- Baseline antes de las correcciones: 75 archivos / 312 tests PASS. Resultado después del primer hardening: 75 archivos / 314 tests PASS.
- Se eliminó la aceptación heredada de `Cancelado · Preparando`: cancelar un pago pendiente lleva pago, orden y shipment a estados cancelados coherentes, limpia tracking y conserva idempotencia/stock.
- Se inició TASK-006 con `FulfillmentActionPolicy`: `PAID_STOCK_REVIEW`, Unknown, shipment Cancelled y RMA REQUESTED/APPROVED/REJECTED quedan fail-closed antes de llegar a la vista.

## 2026-10-15 — TASK-006 checkpoint de autoridad y concurrencia

- OPERATOR puede leer Capabilities en navegación y guard; ADMIN conserva en exclusiva la mutación mediante `canChangeCapabilities`. Unknown sigue sin autoridad.
- `changeCapability` y `persistListing` descartan respuestas del actor anterior mediante el fence de sesión existente.
- El guardado de mapping Mercado Libre usa `exhaustMap`, `listingBusy` y controles deshabilitados para impedir doble submit y edición durante una intención en vuelo.
- Se agregaron reproducciones de reconciliación tardía y guardado ML solapado/cambio de actor.
- Validación: `npm test` PASS — 75 archivos, 316 tests. `npm run build` PASS — bundle inicial 553,26 kB raw / 126,32 kB estimado transferido.

## 2026-10-15 — implementación provisional SC24 y SC26

- SC26 quedó implementada exclusivamente en Demo: `/demo/user/customers`, `CustomerAccountState` cerrado, ADMIN con restricción/reactivación confirmada y motivo, OPERATOR de sólo lectura y Unknown denegado. No se agregó ruta ni endpoint Real.
- La migración aditiva v9→v10 incorpora `customer-2209` relacionado con `ORD-1015`; la restricción es idempotente, revoca la sesión Demo y bloquea login/checkout sin borrar perfil, carrito, pedidos, devoluciones ni reembolsos.
- El editor de productos ahora rechaza precio original inferior a base, cero variantes activas y desactivación con reservas. `DemoApplicationState.run` valida el snapshot resultante antes de persistir para impedir éxito visible seguido de reload inválido.
- SC24 Real separa propuesta y confirmación, conserva UUID por intento y representa el resultado mediante tipos cerrados `Confirmed`, `VersionConflict`, `ResultUncertain` y `Unknown`. Toda escritura reconcilia comando y lista fresca; no existe reenvío automático.
- La confirmación SC24 maneja Escape, trampa/restauración de foco y descarte por cambio de actor. `setCapability` revalida rol ADMIN en dominio; OPERATOR conserva lectura sin mutación.
- SC25 rechaza secretos incluso cuando sus nombres llegan ofuscados mediante escapes JSON antes de preview o merge.
- Fulfillment Real bloquea comandos simultáneos por pedido, permite trabajo concurrente entre pedidos y descarta respuestas del actor anterior. La fila conserva tracking y muestra `Guardando…` mientras existe una intención en vuelo.
- El editor Real de home ya comunica el contrato soportado como `Guardar borrador`; no promete una publicación inexistente.
- Verificación integrada: `npm test` PASS — 81 archivos, 358 tests; `npm run lint` PASS; `npm run check:architecture` PASS; `npm run build` PASS — 561,23 kB raw / 128,16 kB estimado; `npm run build:demo` PASS.
- Verificación de navegador: SC26 5/5 PASS en 390/768/1440, sin overflow y con axe limpio para el diálogo; confirmación SC24 PASS en Chromium con teclado, Escape, foco, cancelación sin POST y reconciliación.
- TASK-006 continúa `in_progress`: todavía faltan políticas cerradas compartidas para ofertas/campañas, inventario, RMA Demo, configuración y los estados residuales enumerados por la auditoría. TASK-013 y TASK-016 no se marcan completas porque sus otras superficies siguen abiertas.

## 2026-10-15 — estrategia de datos para frontend primero

- El backend Kotlin/Spring/PostgreSQL existente puede alimentar catálogo, home, identidad CUSTOMER, direcciones, carrito, checkout y ofertas mediante contratos actuales; una base recién migrada no queda provisionada automáticamente.
- No se autoriza insertar stock directo, fabricar pagos aprobados, activar proveedores ni ampliar APIs sólo para completar una pantalla. El catálogo real se prepara por su API y el checkout real conserva `PENDING_PAYMENT` hasta que exista autoridad de proveedor.
- Las superficies sin productive binding siguen usando fixtures Demo coherentes y `.invalid`; los datos reales se incorporarán por servicios existentes cuando el recorrido visual y su contrato estén cerrados.
- Se pospone cualquier loader/seed de ambiente fuera del WIP actual hasta documentar provisión singleton, capabilities y bootstrap seguro. No se modificaron migraciones ni backend en este checkpoint.

## 2026-10-15 — checkpoint SC17, SC25 y 404 explícito

- SC17 Demo incorpora tipos cerrados para publicación, activación de variante, condición y alcance Outlet; la migración aditiva v11 acepta snapshots v9/v10 y traduce por un único borde.
- El editor de catálogo administra ficha técnica, media ordenable, variantes, precio base/lista, stock físico, no-vendible y condición Outlet por unidad/lote. `VLD-043/outlet-unit-01` queda retenida con 1 física, 1 no-vendible y 0 disponible; no recibe oferta ni se presenta como vendible.
- Comando y decoder comparten las mismas invariantes. El guardado usa revisión esperada, resultado cerrado y preservación del formulario ante conflicto/error; archivar conserva stock e historial.
- SC25 Real traduce el diff una sola vez a `ProfileDiffKind` ADD/UPDATE/UNCHANGED/Unknown, muestra before/after, exige selección no vacía y revalida el manifiesto exacto tras cada cambio de checkbox.
- El merge SC25 usa confirmación accesible ligada al texto previsualizado, bloquea edición durante envío, preserva fuente/selección ante fallo y descarta respuestas o confirmaciones del actor anterior. Unknown o secretos en el diff bloquean éxito.
- Real y Demo tienen 404 explícito y recuperable por contexto. Se eliminó el redirect silencioso a Home; destinos, foco inicial, teclado, guards y axe quedaron cubiertos. TASK-017 continúa parcial porque faltan otros estados y diálogos transversales.
- Verificación SC17: 9 suites Demo / 56 tests PASS; smoke 3/3 PASS en 390/768/1440 con axe y persistencia. El fallo inicial del smoke era un locator de etiqueta; el árbol accesible era correcto y la prueba quedó basada en roles combobox/spinbutton.
- Verificación integrada del lote: `npm test` PASS — 88 archivos, 396 tests; `npm run lint` PASS; `npm run check:architecture` PASS; `npm run build` PASS — 575,00 kB raw / 131,03 kB estimado; `npm run build:demo` PASS.
- SC25 pasó 33 unitarias dirigidas y 2 E2E Chromium; 404 pasó 13 unitarias y 10 Playwright. No se declaran TASK-014, TASK-016 o TASK-017 completas: SC18/19, SC23/24 Demo, SC25 Demo y estados residuales siguen abiertos.

## 2026-10-15 — checkpoint SC04..09 y SC18..19

- SC04 Real incorpora precio opcional seguro, filtros permitidos, chips removibles, `CatalogSort` cerrado/Unknown y paginación local de 12 sobre hasta 100 resultados recibidos. La UI declara el límite; no infiere stock, Outlet ni total de servidor.
- SC05 Real selecciona variante por SKU y recarga detalle/precio autoritativo antes de comprar. Cantidad vive sólo en el store y se valida como entero contra la disponibilidad del SKU seleccionado; carga y envío bloquean duplicados. No se extendió autenticación ni se inventó persistencia de intención.
- SC06..09 Real usan fases/notices cerrados, bloquean doble submit, preservan borradores después de fallos y separan retry de carga de retry de guardado. Registro conserva únicamente retornos CUSTOMER allowlisted.
- Borrar dirección exige confirmación; favoritos declaran alcance local de pestaña y muestran fallo recuperable. No se agregó cambio de contraseña ni sincronización de cuenta.
- SC18/19 Demo separa ofertas de campañas editoriales. Estados de activación, aprobación y lifecycle son cerrados; Unknown bloquea. El reloj canónico es inyectable y una política única decide elegibilidad, margen, piso, prioridad y desempate sin stacking.
- La migración v12 reemplaza las variantes activas legacy de DEMO-001 por `bare-tool` y `kit-completo`, mapea carritos legacy y preserva snapshots históricos de pedidos/devoluciones. `OFF-DEMO-001` proyecta $198.800 → $159.040; VLD-043 continúa no vendible.
- ADMIN administra ofertas y campañas; OPERATOR sólo ofertas. La vista comercial muestra la fuente ganadora y marca los especímenes sintéticos como tales.
- La primera integración encontró una regresión: `submitRegister` bloqueaba la transición probada desde una sesión CUSTOMER existente. Se eliminó ese guard redundante y se mantuvo `AccessCoordinator` como autoridad; 30 pruebas dirigidas y la suite completa volvieron a verde.
- Verificación integrada: `npm test` PASS — 94 archivos, 427 tests; `npm run lint` PASS; `npm run check:architecture` PASS; `npm run build` PASS — 600,65 kB raw / 136,09 kB estimado; `npm run build:demo` PASS. SC18/19 smoke 3/3 y SC04/05 smoke+axe 2/2 PASS con directorios de artifacts aislados.
- Los cortes no cierran sus tareas globales: SC04/05 conserva límites contractuales y matriz E2E responsive parcial; SC06..09 requiere todavía visual/E2E; SC18/19 no tiene E2E exhaustivo de conflicto/persistencia fallida.

## 2026-10-15 — cierre ejecutable de la matriz frontend provisional

- SC15/16 y SC20..26 usan superficies Demo dedicadas para dashboard, contenido, pedidos, inventario, clientes, Mercado Libre, capabilities y configuración. La orden canónica `ORD-1015` queda legible para OPERATOR sin exponer comandos ADMIN.
- Los accesos rápidos del dashboard conservan sus filtros en la URL y los traducen en el borde a `PaymentStatus` e `InventoryScope`; Unknown vuelve a la opción segura. El control visible y el conjunto resultante permanecen sincronizados.
- Se migraron los E2E heredados a las variantes canónicas `kit-completo`/`bare-tool`, al flujo de checkout que bloquea artículos archivados y a los contratos actuales de contenido, campañas, inventario y configuración. No se reintrodujeron IDs legacy ni claims productivos.
- `npm run test:demo`: **52/52 PASS** en Chromium, incluidos 390/768/1440, axe, persistencia, carrito, checkout, outlet, fulfillment, clientes, operaciones, diálogos, permisos, 404 y aislamiento de red Demo.
- `npx playwright test --config playwright.config.ts`: **56/56 PASS** sobre la aplicación Real con fixtures, incluidas todas las rutas runtime, accesibilidad, contraste, login unificado, checkout y guards. Esto no equivale a homologación RealLocal HTTPS ni a proveedores externos.
- Gates locales: arquitectura **6/6 PASS**, lint PASS, unitarias **103 archivos / 473 tests PASS**, build producción PASS (**623,74 kB raw / 141,38 kB estimado**) y build Demo PASS (**3,09 MB raw**).
- La auditoría de residuos no encontró comparaciones de estados/roles/métodos/fases mediante strings mágicos ni marcadores TODO/FIXME/HACK/XXX en las fuentes y pruebas examinadas. TASK-006 queda `done`; TASK-007 pasa a `in_progress` para eliminar delegación residual del monolito y cerrar persistencia por responsabilidad.
- TASK-003/TASK-004/TASK-019 permanecen abiertos: la implementación es PROVISIONAL hasta que Stitch produzca la evidencia visual faltante y el mismo artefacto reciba los tres APPROVE. TASK-020 conserva pendiente el build de imágenes porque no hay daemon Docker disponible; los Dockerfiles ya existen.

## 2026-10-15 — TASK-007 checkpoint A: persistencia transaccional extraída

- `DemoApplicationState` dejó de conocer la clave, serialización, validación previa, lectura actual y comparación cross-tab de `localStorage`; esas responsabilidades viven ahora en `DemoSnapshotPersistence`, el único borde de almacenamiento del snapshot Demo.
- El repositorio valida el snapshot completo antes de escribir, detecta borrado o reemplazo incluso con la misma revisión y conserva el comportamiento de reparación explícita durante reset. La capa de aplicación mantiene coordinación de sesión, señales, mensajes y rollback, sin importar detalles de la clave persistida.
- Se agregaron pruebas para fallback sin escritura, rechazo pre-storage de un snapshot inválido y conflictos por borrado/reemplazo. Las pruebas históricas de rollback, pestaña obsoleta y fallo de `setItem` continúan cubriendo al consumidor.
- Verificación del checkpoint: lint PASS; suite Angular **104 archivos / 476 tests PASS**. TASK-007 continúa `in_progress`: falta extraer los comandos residuales de `DemoCommerce` y reducir `DemoPageComponent` a presenters/controladores por superficie antes de satisfacer su gate completo.

## 2026-10-15 — TASK-007 checkpoint B: catálogo, checkout e identidad por responsabilidad

- Los tipos cerrados transversales de Demo viven en `demo-types.ts` y se siguen reexportando desde el contrato anterior; no se duplicaron instancias ni traductores `fromWire`.
- `DemoCatalogQuery` concentra resolución de producto/variante canónica, disponibilidad, precio comercial y proyección de totales. `DemoCommerce` conserva su API pública, pero delega esas consultas al colaborador puro.
- `DemoCartCommands` concentra cantidad, alta/baja de líneas, reconfirmación de cotización, checkout idempotente, resolución/cancelación de pago y efectos de reserva/stock. El coordinador sólo conecta puertos y delega.
- `DemoCustomerAccounts` concentra identidad, autorización CUSTOMER, lectura/escritura de cuentas y favoritos. La política ADMIN/OPERATOR/Unknown permanece cerrada y probada.
- `DemoFulfillmentCommands`, `DemoInventoryCommands`, `DemoCompetitionCommands`, `DemoCatalogCommands` y `DemoSettingsCommands` separan timeline/incidencias/RMA, ledger/stock ML, observación pública competitiva, escrituras catálogo/ofertas/campañas y configuración. Todos operan mediante puertos pequeños y tipos cerrados.
- Se corrigió una combinación imposible descubierta durante la extracción: un pago rechazado al crear la orden ahora nace con shipment `Cancelled`, nunca `Preparing`; una prueba dedicada congela la invariancia.
- `demo-model.ts` se redujo de **408 a 257 líneas** sin cambiar los contratos consumidos por componentes ni la persistencia. Todos los comandos públicos de negocio de `DemoCommerce` delegan; el coordinador conserva sólo snapshot, revisión, capability, commit y proyección de cola como infraestructura. La auditoría volvió a encontrar cero comparaciones de estado/rol/método/fase contra strings mágicos y cero TODO/FIXME/HACK/XXX.
- Verificación final de este checkpoint: unitarias **105 archivos / 480 tests PASS**; Demo E2E **52/52 PASS** sobre el build posterior a todas las extracciones; lint PASS; arquitectura **6/6 PASS**; build producción PASS (**623,74 kB raw / 141,38 kB estimado**); build Demo PASS (**3,09 MB raw**).
- TASK-007 continúa `in_progress` únicamente por el lado de presentación: `DemoPageComponent` todavía debe reducirse a presenters/controladores por superficie y las vistas deben consumir esos view models tipados antes de satisfacer AC-1/G3.

## 2026-10-15 — TASK-007 checkpoint C: presentación tipada iniciada

- `DemoDialog`, ordenamientos de catálogo/pedidos, filtros administrativos y paginación dejaron `DemoPageComponent` y viven en `presentation/demo-view-types.ts` como tipos cerrados/presenters puros.
- El componente se redujo de **448 a 377 líneas** en este corte; el contrato `DemoPagination` conserva reexport temporal para consumidores existentes, mientras su prueba ya importa el módulo dueño.
- Validación posterior: unitarias **105 archivos / 480 tests PASS**, lint PASS, build producción PASS (**623,74 kB raw / 141,38 kB estimado**), build Demo PASS (**3,10 MB raw**) y E2E dirigido de matriz CTA/regresiones responsive **14/14 PASS**.
- La matriz completa inmediatamente anterior, ya sobre todos los casos de uso extraídos, fue **52/52 PASS**. TASK-007 sigue `in_progress`: faltan presenters/controladores por familia para filtros/proyecciones y comandos UI del componente legado antes de cerrar AC-1.

## 2026-10-15 — TASK-007 checkpoint D: presenters y editor de catálogo aislados

- `DemoCatalogPresenter`, `DemoAdminPresenter` y `DemoCommercePresenter` concentran ahora filtros, paginación, relacionados, carrito, favoritos, stock bajo, ingresos, comprobante no fiscal y etiqueta de avance de fulfillment. Las proyecciones son puras, reciben dependencias explícitas y no importan Angular ni navegador.
- El formulario complejo de producto, variantes y Outlet delega sus operaciones de borrador en `DemoProductDraftEditor`. Creación, atributos, media, reordenamiento, variantes y material Outlet dejaron de vivir como reglas ad hoc del componente.
- Los rechazos del editor se representan mediante el tipo cerrado `ProductDraftIssue`, con `fromWire` y caso `Unknown`; quitar la única imagen, la única variante o una variante reservada preserva el borrador y entrega un resultado tipado.
- Validación unitaria: **109 archivos / 494 tests PASS**. Lint PASS; arquitectura **6/6 PASS**; build producción PASS (**623,74 kB raw / 141,38 kB estimado**) y build Demo PASS (**3,10 MB raw**).
- Validación browser posterior a los presenters: **23/23 PASS** sobre matriz CTA, dashboard/contenido, fulfillment/inventario y regresiones responsive. Validación posterior al editor: **11/11 PASS**, incluidos SC17 en 390/768/1440 y todas las acciones del editor administrativo.
- La auditoría de `src/app` no encontró literales mágicos para los estados/roles/pagos examinados ni `TODO/FIXME/HACK/XXX`. `DemoPageComponent` conserva coordinación de formularios, diálogos y descargas, por lo que TASK-007 continúa `in_progress` hasta que las vistas emitan intents tipados por familia y AC-1 quede satisfecho por completo.

## 2026-10-15 — TASK-007 checkpoint E: identidad y contenido fuera de la vista

- `DemoCustomerAccounts` es ahora la única autoridad Demo para registro, actualización de perfil, alta/edición/baja de direcciones y selección de domicilio principal. La vista dejó de insertar actores y mutar direcciones/perfil directamente sobre el snapshot.
- Las escrituras revalidan CUSTOMER activo, normalizan datos y fallan cerradas ante email duplicado, campos incompletos o dirección inexistente. `DemoCommerce` conserva su contrato público como coordinador y sólo delega.
- `DemoContentDraftEditor` concentra clonación, dirty-check y reordenamiento inmutable. `ContentDraftIssue` representa validación como tipo cerrado con `fromWire` y `Unknown`.
- `DemoContentCommands` es la autoridad de escritura del contenido: sólo ADMIN/OPERATOR pueden guardar, el borrador se valida una vez y el commit ocurre después de autorizar. La vista conserva exclusivamente el estado transitorio del formulario y el fence de actor durante la espera.
- Verificación: unitarias **112 archivos / 502 tests PASS**; lint PASS; arquitectura **6/6 PASS**; build producción PASS (**623,74 kB raw / 141,38 kB estimado**) y build Demo PASS (**3,11 MB raw**).
- La matriz Demo completa posterior a este corte fue **52/52 PASS**, incluidas las 26 superficies, CTA, identidad, direcciones, contenido, permisos, persistencia, 404, axe y responsive 390/768/1440. Los servidores y Chromium temporales finalizaron con la suite.
- La auditoría sigue sin literales mágicos examinados ni `TODO/FIXME/HACK/XXX`. TASK-007 continúa `in_progress`: quedan checkout/diálogos/descargas y comandos operativos de canal/configuración dentro de `DemoPageComponent` antes de cumplir AC-1 por completo.

## 2026-10-15 — TASK-007 checkpoint F: operaciones sin mutación directa desde la vista

- `DemoInventoryCommands` concentra ahora conexión/estado Mercado Libre, alta-baja de vínculo, resolución de mapping y sincronización individual. Estado `Unknown`, cuenta no autorizada, mapping conflictivo o listing inexistente fallan cerrados.
- `DemoCompetitionCommands` concentra pausa/reactivación, resolución, eliminación y lectura global de alertas competitivas. `DemoSettingsCommands` concentra toggles de módulo, preferencias tipadas y lectura de alertas.
- La importación de manifiesto de contenido se movió a `DemoContentCommands`: revalida ADMIN, estructura y título antes del commit. La vista ya no escribe `state.data`, `state.actor` ni llama `commerce.touch()`; todas las mutaciones de negocio observadas delegan a comandos.
- Verificación final del corte: **113 archivos / 507 tests PASS**, lint PASS, arquitectura **6/6 PASS**, build producción PASS (**623,74 kB raw / 141,38 kB estimado**) y build Demo PASS (**3,11 MB raw**).
- La matriz Demo completa inmediatamente anterior pasó **52/52** después del corte identidad/contenido. Tras la extracción operativa, SC23–25 + CTA pasó **12/12** y la repetición final de toda la matriz CTA pasó **8/8**.
- No quedan servidores ni navegadores de validación activos. La auditoría mantiene cero `TODO/FIXME/HACK/XXX` y cero comparaciones examinadas contra strings mágicos. TASK-007 sigue `in_progress` porque checkout, diálogos, descargas y el contrato de intents tipados de la plantilla aún deben separarse antes de afirmar AC-1.

## 2026-10-15 — TASK-007 checkpoint G: cierre de presentación, flujo y efectos

- `DemoCheckoutFlow` concentra el avance y la validación final del checkout. Cada paso sigue siendo un objeto cerrado y `DemoCheckoutIssue` representa `None`, domicilio faltante, entrega faltante, pago faltante y `Unknown` mediante un único `fromWire`; la vista sólo traduce el resultado tipado a feedback.
- `DemoBrowserEffects` es el único borde de navegador para foco inmediato/diferido, apertura y cierre de diálogo, descarga, impresión y reload. `DemoRootComponent` y `DemoPageComponent` dejaron de usar directamente `document`, `window`, `URL` y `Blob`.
- El controlador modal conserva foco inicial, Escape, cierre explícito y restauración al invocador; descargas y exportaciones se generan mediante un puerto de URL de blob inyectable y probado sin acoplar dominio ni presenters al navegador.
- La auditoría final de `src/app/demo` no encontró accesos directos al navegador fuera del borde, comparaciones examinadas de estados contra strings mágicos ni marcadores `TODO/FIXME`.
- Verificación unitaria: **115 archivos / 511 tests PASS**. Lint PASS; arquitectura **6/6 PASS**; build producción PASS (**623,74 kB raw / 141,38 kB estimado**).
- Verificación de navegador posterior al corte: CTA + regresiones responsive **14/14 PASS** y matriz Demo completa **52/52 PASS** en Chromium, incluidos 390/768/1440, checkout con todos los resultados, diálogos/foco, identidad, catálogo, operaciones, 404, persistencia y aislamiento de red.
- TASK-007 queda `done`: persistencia, consultas, comandos, políticas, editores, presenters, flujo de pasos y efectos están separados por responsabilidad; `DemoCommerce` coordina y delega, y las vistas consumen modelos tipados y emiten intent mediante métodos tipados.
- TASK-003/TASK-004/TASK-008 y, por dependencia formal, TASK-009..019 permanecen abiertos hasta obtener y aprobar los artefactos visuales Stitch faltantes. La implementación funcional existe y está validada, pero no se falsea el gate de diseño.

## 2026-10-15 — validación integral posterior y reintento controlado de Stitch

- La matriz Real completa posterior al cierre arquitectónico pasó **56/56** en Chromium: inventario exacto de rutas, axe, contraste, login unificado, cuenta CUSTOMER, checkout en 320/390/768/1440, pedidos, 404, capabilities, importación y aislamiento de fixtures/red.
- La matriz Demo del mismo corte permanece en **52/52 PASS**. No quedan servidores de prueba activos después de ambas ejecuciones.
- Stitch volvió a aceptar una generación inmutable de `SC-SURF-20 R6.3` en vez de rechazarla por cuota, pero la llamada expiró a los 300 segundos. Se respetó la regla de no reintentar; consultas posteriores al inventario siguen mostrando 170 pantallas y ningún candidato R6.3 nuevo. El pedido puede continuar en segundo plano y se seguirá consultando sin duplicarlo.
- Docker Desktop continúa sin daemon (`docker_engine` inexistente). `Dockerfile`, `Dockerfile.runtime`, `nginx.conf` y `.dockerignore` están presentes, pero TASK-020 no se cierra sin compilar ambas imágenes y comprobar `/ping`.
- Los warnings de preload durante E2E Real corresponden a assets externos bloqueados por el fixture offline; no produjeron violaciones de aislamiento ni fallos de ruta. No se habilitó red externa para ocultarlos.

## 2026-10-15 — TASK-020 packaging reproducible cerrado

- La primera compilación ejecutable detectó que `node:22.14.0-alpine` era incompatible con Angular 22.2.1, que exige Node 22.22.3, 24.15.0 o 26. Se corrigió el stage de dependencias a la versión fijada `node:24.15.0-alpine`; no se usó un tag flotante.
- `docker build --target production -t storecore-frontend:local-production .` PASS. El stage compila **623,74 kB raw / 141,38 kB estimado** y sólo copia `dist/storecore-frontend/browser` al runtime Nginx.
- `docker build --target demo -t storecore-frontend:local-demo .` PASS. El stage Demo compila **3,11 MB raw** y sólo copia `dist/storecore-demo/browser`; producción continúa siendo el target final por defecto.
- Ambas imágenes se levantaron en puertos locales aislados. Producción respondió `200 text/plain` en `/ping` y `200 text/html` en una ruta profunda; Demo respondió los mismos contratos en `/ping` y `/demo/catalog/DEMO-001`.
- Los dos contenedores se ejecutaron con `--rm`, fueron detenidos en un bloque `finally` y Docker Desktop se apagó al finalizar. No queda runtime temporal consumiendo recursos.
- TASK-020 queda `done`: build multi-stage reproducible, separación producción/Demo, runtime mínimo, health check y fallback SPA fueron probados localmente; no se realizó deploy.
- `npm audit --omit=dev --json` reporta **0 vulnerabilidades productivas**. El audit completo reporta 13 hallazgos altos encadenados desde tooling de build/test (`@angular/build`, Vite/Vitest, PostCSS/Sass) hacia `source-map-js <1.2.2`; npm no ofrece corrección compatible para los directos. Esas dependencias sólo existen en el stage de compilación y no se copian al runtime Nginx. No se aplicó `audit fix` destructivo ni se ocultó el hallazgo; queda para revalidación cuando Angular publique una resolución compatible.

## 2026-10-16 — R7 operador y aceptación RealLocal adicional

- Se solicitó una edición R7 conjunta y determinista de SC20B, SC21A, SC22B,
  SC23B, SC24B, SC25B y SC26B, con separación Demo/Real, fixtures exactas,
  roles, diálogos, WCAG 2.2 AA y reflow 390/768/1440. Stitch aceptó el pedido
  pero agotó el tiempo del conector a los 300 segundos; no se reintentó.
- La consulta posterior conservó 170 pantallas. La lectura directa de los siete
  IDs confirmó títulos R6/R6.1/R6.2/R6.4 y los mismos tamaños; no existe evidencia
  verificable de que la edición R7 se haya aplicado. TASK-003 y TASK-004 siguen
  abiertos y no se fabrica un APPROVE.
- `npm run test:ua-real-local:managed` pasó **3/3** contra PostgreSQL 16.14,
  Flyway V1..V22, Spring real y Angular HTTPS. Además de UA y favoritos, el nuevo
  recorrido crea una orden de pago pendiente desde la UI, comprueba detalle
  CUSTOMER sin comandos y fulfillment USER bloqueado sin comandos.
- `npm run verify` posterior pasó arquitectura, lint, **119 archivos / 523 tests**
  y build productivo. La implementación Angular funcional continúa validada;
  el cierre visual depende de evidencia R7 nueva y triple review sobre esa misma
  revisión.
- Un segundo intento, esta vez como generación inmutable nueva de
  `SC-SURF-20A Pedidos — Baseline R7`, fue aceptado como sesión
  `11244229926573428330` pero no materializó pantalla. Diez consultas espaciadas
  mantuvieron el inventario en 170 y no encontraron un ID R7. No se duplicó la
  solicitud ni se avanzó a SC21–SC26 consumiendo cuota sobre una cola incierta.

## 2026-10-16 — Cierre integrado de experiencia comprador y administración

- Comprador conserva SKU, variante y cantidad al autenticarse; PDP y carrito dan feedback junto a la acción, muestran disponibilidad por variante y enlazan nuevamente al producto.
- Checkout revisa dirección o retiro, costo y plazo antes de confirmar, permite volver al destino y bloquea catálogo archivado, variante inactiva, precio o stock desactualizado.
- Postventa calcula el remanente devolvible mediante una política cerrada compartida por UI y comando; una línea agotada no ofrece una operación que el dominio rechazará.
- Administración muestra comprador, contacto, fecha autoritativa, productos y modalidad; ordena por cronología real, ofrece filtros recuperables y permite al rol Operator ejecutar acciones operativas válidas sin abrir capacidades ejecutivas.
- Dashboard usa ventanas calendario, no cantidad de filas. El editor de contenido protege borradores con `canDeactivate` y `beforeunload`.
- El ledger aprobado queda único: `DEMO-001/kit-completo` físico 7, reservado 2, vendible 5; `bare-tool` físico y vendible 0. Catálogo, carrito, inventario y proyección de canal usan esa autoridad.
- La migración preserva existencias y reservas históricas al renombrar variantes; el ledger fijo 7/2/5 y 0/0 se aplica únicamente al seed nuevo. Una regresión migra un pago pendiente legacy y demuestra que su reserva puede liberarse sin valores negativos.
- Evidencia integrada: ESLint PASS; build Real PASS; build Demo PASS; **125 archivos / 549 tests unitarios PASS**; **58/58 escenarios Playwright Demo PASS**, incluidos comprador, administrador, Operator, responsive 390/768/1440, accesibilidad, checkout, devoluciones, stock y borradores.
- No se creó commit, PR, merge ni publicación. Stitch R7 continúa sin evidencia materializada; la aprobación visual nueva sigue siendo un gate distinto del cierre funcional validado aquí.

## 2026-10-16 — paridad Real parcial SC16/SC18/SC19 y reviews cerradas

- SC16 dejó de compartir el store multipropósito: usa un store de contenido con fases cerradas, exclusión de escritura, borrador confirmado, dirty/discard y preview independiente. El fallo al refrescar la portada pública ya no convierte un PUT confirmado en un falso fallo de guardado.
- La vista Real de contenido implementa editor/preview profesional, reflow 768/390, aviso honesto de bloques read-only y confirmación de descarte. El guard permite logout tras reset de actor y bloquea una salida mientras una escritura dirty está activa.
- SC18 retiró los CTA productivos de lifecycle no autorizados por el binding. El endpoint/adapter no se borró, pero la UI Real ya no promete una mutación fuera de alcance.
- SC19 usa `ManualPromoWriter` cerrado; valores wire desconocidos permanecen Unknown y quedan bloqueados antes de la escritura HTTP.
- Evidencia: tests dirigidos 8/42 PASS, regresión de guard 2/8 PASS, suite completa 129 archivos/564 tests PASS, arquitectura 6/6 PASS, lint PASS y build productivo PASS (623,36 kB raw / 141,60 kB estimado).
- Tres rondas coordinadas Astra Bugbot+Security cerraron 3 P2 acumulados; la revisión final fue `APPROVE`, 0 P1/P2 en el corte. Evidencia detallada: `evidence/real-sc16-sc19-cut-20261016.md`.
- TASK-018/021/022/024 globales permanecen abiertos: este checkpoint no acredita SC17 ni el resto de superficies Real, performance, gate visual total o SHA final.

## 2026-10-16 — paridad Real SC17 y triple gate ejecutable

- El catálogo administrador Real dejó el editor técnico de texto libre: ahora presenta búsqueda y filtro tipado, cards responsive, métricas, galería estructurada, variantes, precios separados y taxonomías.
- `ProductActivation` y `CatalogActivationFilter` cierran el wire con `Unknown`; mapper, store, vista, tests y repositorio usan esas instancias. El repositorio serializa el booleano y rechaza estados desconocidos.
- Se respetó el backend existente: no hay CTA de baja para variantes persistidas, su ID es autoritativo/read-only y el stock sólo se modifica desde Inventario. Imágenes vacías o no HTTPS, productos sin variante y estados desconocidos fallan antes del PUT.
- El borrador conserva dirty/baseline, exige descarte explícito al cambiar producto o ruta, usa `beforeunload`, bloquea edición mientras guarda y elimina selecciones privadas pendientes al reset de actor.
- Tres rondas coordinadas Astra cerraron los P2 de baja ficticia, ID cliente, pérdida de borrador, producto incompleto, accesibilidad, imagen vacía, reconciliación y fence de actor. Veredicto final conjunto: **Bugbot APPROVE, Security APPROVE, UX/Product APPROVE; 0 P1/P2**.
- Evidencia final: arquitectura **6/6 PASS**, lint PASS, **133 archivos / 580 tests PASS**, build productivo PASS (**642.32 kB raw / 145.10 kB estimado**) y browser Real **3/3 PASS** a 390/768/1440 con Axe y sin overflow horizontal.
- Evidencia detallada: `evidence/real-sc17-catalog-cut-20261016.md`. TASK-014/018/021/022/024 globales permanecen abiertas hasta integrar el resto de superficies, performance y SHA final.

## 2026-10-16 — paridad Real SC21A pedidos y entrega

- La cola administrativa incorporó búsqueda, filtros cerrados, estados/pago/total autoritativos, vacío recuperable y reflow móvil; el detalle presenta el desglose comercial existente sin inventar cliente, dirección, fecha o historial.
- Cada transición exige confirmación contextual. Tracking sólo viaja con `SHIPPED`; entregar preserva el código almacenado o admite ausencia. La recepción RMA continúa siendo whole-order y no promete reembolso ni reposición.
- Stores de cola y detalle no repiten POST inciertos. Las lecturas usan fences de generación; en la cola un contador común mantiene el bloqueo hasta concluir todas las lecturas y descarta snapshots anteriores.
- Tipos cerrados gobiernan comando, filtro, fase y estado resultante. Las vistas no comparan strings mágicos.
- Triple review Astra final: **Bugbot APPROVE, Security APPROVE, UX/Product APPROVE; 0 P1/P2**.
- Evidencia: arquitectura **6/6 PASS**, lint PASS, unitarias **136 archivos / 590 tests PASS**, build productivo PASS, backend focalizado PASS y Chromium **3/3 PASS** en 390/768/1440 con foco/Escape, Axe y sin overflow.
- Evidencia detallada: `evidence/real-sc21a-order-operations-cut-20261016.md`. SC21B y el gate visual global de las demás superficies siguen abiertos; no se creó PR ni merge.

## 2026-10-16 — paridad Real SC22 inventario de sólo lectura

- Inventario Real incorporó actualización GET, métricas con alcance explícito, búsqueda SKU, filtro cerrado, conteo, limpieza, vacío recuperable y tabla que se convierte en tarjetas móviles.
- `InventoryAvailability` e `InventoryFilter` cierran estados y filtros. El mapper valida el wire crudo: SKU vacío o cantidades ausentes, nulas, textuales, booleanas, negativas o fraccionarias quedan Unknown/No informado; una colección malformada falla.
- Los agregados propagan `No informado` si falta cualquier componente. No se fabrican ceros ni se vuelve a restar reservado o seguridad del disponible autoritativo.
- El refresh conserva e identifica el último snapshot cuando falla; cambio de actor cancela/limpia la lectura y reinicia filtros. El endpoint de ajuste existente permanece fuera del port y sin CTA.
- Triple review Astra final: **Bugbot APPROVE, Security APPROVE, UX/Product APPROVE; 0 P1/P2**. Los P3 visuales fueron corregidos después del gate.
- Evidencia: arquitectura **6/6 PASS**, lint PASS, unitarias **138 archivos / 595 tests PASS**, build productivo PASS y Chromium **3/3 PASS** en 390/768/1440 con Axe, sin overflow y sin escrituras.
- Evidencia detallada: `evidence/real-sc22-inventory-cut-20261016.md`. Stitch SC22 continúa `CHANGES_REQUESTED`; no se creó PR ni merge.

## 2026-10-16 — paridad Real SC23 cuenta y mapeos Mercado Libre

- La superficie Real presenta cuenta autoritativa, búsqueda/listado responsive y editor exacto del mapeo existente sin prometer OAuth, lifecycle, sincronización, competencia ni repricing.
- Tipos cerrados gobiernan fase, modo y elegibilidad. El borde valida IDs y cuenta, la URL codifica el identificador y el PUT envía únicamente el contrato permitido.
- La cuenta se revalida antes de escribir; la identidad tripleta queda fija al editar y un alta sobre una tripleta existente se confirma como remapeo con el SKU anterior real.
- Todo PUT se reconcilia con GET autoritativo. Respuesta ambigua nunca habilita reenvío: conserva el borrador en `Uncertain`, bloquea escritura y mantiene actualización/descarte/navegación recuperables.
- Triple review Astra final: **Bugbot APPROVE, Security APPROVE, UX/Product APPROVE; 0 P1/P2**. Los P3 de foco, texto y ancho fueron corregidos.
- Evidencia: arquitectura **6/6 PASS**, lint PASS, unitarias **140 archivos / 608 tests PASS**, build productivo PASS y Chromium **3/3 PASS** en 390/768/1440 con Axe y sin overflow.
- Evidencia detallada: `evidence/real-sc23-mercadolibre-mapping-cut-20261016.md`. Stitch SC23 continúa `CHANGES_REQUESTED`; no se creó PR ni merge.

## 2026-10-16 — paridad Real SC24 módulos del comercio

- Capabilities Real se convirtió en una superficie de fichas con búsqueda, filtro, conteo y tres ejes cerrados: estado operativo, disponibilidad y nivel de entrega.
- Las siete fichas aprobadas conviven con cualquier módulo productivo adicional sin recortar el backend; metadata no clasificada permanece `Unknown` y módulos sin ID son informativos.
- Admin prepara un cambio contextual con motivo y versión; Operator sólo consulta. Confirmación, UUID único, status y lista fresca se reconcilian sin reenvío.
- Resultado incierto conserva el comando y permite consultar el mismo UUID. Conflicto restaura destino/motivo contra la versión fresca.
- Refresh y reconciliación se serializan; navegación/reload quedan bloqueadas sólo mientras el comando está en curso. Cambio de actor cancela y limpia.
- Triple review Astra final: **Bugbot APPROVE, Security APPROVE, UX/Product APPROVE; 0 P1/P2**. Todos los P3 se incorporaron.
- Evidencia: arquitectura **6/6 PASS**, lint PASS, unitarias **141 archivos / 616 tests PASS**, build productivo PASS y Chromium **4/4 PASS** con tres viewports, Axe, sin overflow y recuperación sin segundo POST.
- Evidencia detallada: `evidence/real-sc24-capabilities-cut-20261016.md`. Stitch SC24 continúa `CHANGES_REQUESTED`; no se creó PR ni merge.

## 2026-10-19 — paridad Real SC25 importación de perfil

- El importador Real se convirtió en un workbench profesional de preview, diff, selección y confirmación con alcance limitado a contenido de inicio.
- Frontend, Demo y backend comparten contrato estricto: claves/tipos exactos, límites 1 MB / 200 secciones / 20 KB por contenido, sin coerción ni persistencia de secretos o campos extra.
- Un merge fallido invalida la autorización previa; navegación dirty exige descarte explícito y comparte una única decisión ante intentos consecutivos. Cambio de actor cancela y limpia.
- Las operaciones de diff y fases son tipos cerrados; wire desconocido queda `Unknown` y bloqueado.
- Evidencia: arquitectura 6/6 PASS, lint PASS, **141 archivos / 622 tests PASS**, build productivo PASS, Chromium **7/7 PASS** en 390/768/1440 con Axe/sin overflow y PostgreSQL Testcontainers **6/6 PASS**.
- Evidencia detallada: `evidence/real-sc25-profile-import-cut-20261019.md`. Stitch SC25 y PR/merge continúan como gates separados.

## 2026-10-19 — SC26 Administración Demo de clientes

- Se completó la superficie Demo de clientes para Admin/Operator: búsqueda, filtros, vacíos, ficha mínima, pedido canónico, confirmación con motivo y lectura responsive.
- La restricción/reactivación usa un journal atómico con epoch monotónico. No se pierden restricciones por escrituras concurrentes, sesiones corruptas, primera persistencia, comandos atrasados ni fallos posteriores al commit.
- El restablecimiento conserva la autoridad anterior si falla el reemplazo; sólo una sustitución válida limpia los eventos.
- Triple review Astra final: **Bugbot APPROVE, Security APPROVE, UX/Product APPROVE; 0 P1/P2**.
- Evidencia: arquitectura **6/6 PASS**, lint PASS, **141 archivos / 631 tests PASS**, build productivo PASS y Chromium **5/5 PASS** a 390/768/1440 con Axe y sin overflow.
- Evidencia detallada: `evidence/demo-sc26-customer-administration-cut-20261019.md`. Stitch y PR/merge permanecen como gates separados.

## 2026-10-20 — cierre funcional local SC03, SC20 y SC21B

- SC03 amplió recuperación Demo a un lifecycle cerrado completo, con submitting visible, errores recuperables, token inválido/vencido/usado, resultado completo, doble envío bloqueado y retorno confinado a destinos Demo seguros.
- SC20 normalizó la fixture a los doce IDs aprobados, agregó filtro cerrado de incidencias, conteo de selección y CSV informativo exacto mediante la frontera de efectos del navegador; `incident=NONE` evita celdas ambiguas.
- SC21B separó recepción, inspección, disposición e inventario/reembolso. La devolución dañada incrementa físico y no-vendible sin aumentar disponible; repetir disposición o reembolso queda bloqueado. El eje de refund y el saldo permanecen separados del estado de pago.
- Evidencia local: unitarias **141 archivos / 636 tests PASS**, build Demo PASS, build Real PASS, Playwright dirigido **16/16 PASS** y suite Demo completa final **60/60 PASS**.
- Evidencia detallada: `evidence/demo-sc03-sc20-sc21b-functional-cut-20261020.md`. TASK-003/004/015/019/021 siguen abiertas por diseño/review global, matriz completa y SHA; no hubo backend, homologación, commit, push ni PR.

## 2026-10-20 — remediación de hallazgos P2

- Se corrigieron audiencia cerrada de alertas comprador, round-trip de reconciliación por variante, fixture/identidades/inventario y reservas del ledger canónico, invariantes cruzadas del decoder, Shipping previo a mutaciones, lecturas atrasadas de favoritos, CSV tipado en ARS y cancelación/generación del timer de recuperación.
- La Demo usa exclusión real mediante Web Locks con una pestaña escritora por origen y degradación explícita a lectura. No se presenta localStorage como CAS. La entrada Real permanece separada.
- ORD-1021 conserva su reembolso histórico con origen cerrado y monto no informado/saldo no calculable; no se inventan importe ni disposición. ORD-1015 parte sin RMA y mantiene el reintegro parcial comprobable de $84.500.
- Validación: arquitectura **6/6 PASS**, lint PASS, unitarias **144 archivos / 654 tests PASS**, build Real y Demo PASS; browser Demo **67/67 PASS**, más revalidación final de inventario/P2 **12/12 PASS** tras limpiar una reserva legacy huérfana.
- Evidencia detallada y límites: `evidence/p2-astra-remediation-20261020.md`. Los gates globales de diseño, SHA, CI y cierre SDD continúan abiertos. Sin commit, push ni PR.

## 2026-10-20 — cierre funcional Real/Demo y aceptación durable

- RealLocal administrado quedó **3/3 PASS** y cerró el flujo real completo con
  evidencia SQL durable de pago firmado, fulfillment, stock y RMA.
- Gate global Real: arquitectura 6/6, lint, **147 archivos / 667 tests** y build
  productivo PASS. Demo final: build y browser completo **73/73 PASS**.
- Las acciones shipment usan `ShipmentTransition.actionLabel` como autoridad
  cerrada compartida por vista y prueba; el helper de acceso espera la cookie
  opaca de challenge antes de consumirla.
- Desarrollo funcional local queda listo para preparar PRs. TASK-003/004/019 y
  los gates de SHA/CI/integración siguen abiertos donde dependen de Stitch,
  evidencia remota o aprobación de split; no se declara homologación externa.

### Re-review posterior: cinco P2 adicionales

- Reserva explícita por pedido evita que cancelar ORD-1012 libere stock de ORD-1013/1022; ausencia de evidencia legacy bloquea efectos.
- Favoritos reconcilia lecturas previas con add/remove confirmados sin perder favoritos anteriores del servidor.
- Contabilidad de recepción cerrada evita duplicar el físico de ORD-1021; Restock/Damaged hacen round-trip, y el reembolso histórico no habilita otro reintegro local.
- El estado cerrado de incidencia controla cola, detalle, dashboard y resolución: ORD-1018 permanece Resolved.
- Restringir/reactivar cuentas exige writer antes del cambio y en el commit del evento; la denegación revierte cambios locales no comprometidos.
- Validación de este re-review: **146 archivos / 664 unitarias PASS**, lint, arquitectura **6/6**, build Demo y Real PASS; browser dirigido **22/22 PASS**. No se reutiliza el 67/67 anterior como ejecución browser completa de este delta. Evidencia en el addendum de `evidence/p2-astra-remediation-20261020.md`.

## 2026-10-27 — SC-SURF-25 Real dedicated import workflow

Implemented provisionally on base `a6ce9fa926650c9a1a109d9f02281d22046157b4`: dedicated store, closed domain states and compatibility/operations, exact-text selection → preview → native confirmation → HTTP merge, strict diff snapshots in both backend shapes, actor/denial cleanup, one write at a time and uncertain-result recovery via preview only. Owner browser acceptance: `frontend/e2e/admin-profile-import.spec.ts`. Current evidence: `evidence/real-sc25-profile-import-cut-20261027.md`. TASK-016 overall remains pending: this cut does not certify all ML/Demo tasks, Stitch, integration live, final reviews or CI.
