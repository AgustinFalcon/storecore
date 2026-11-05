# Readiness de implementación — SC-SURF-20..26

Fecha de corte: 2026-10-15

Estado: preparación técnica cerrada; implementación Angular bloqueada por `TASK-004` hasta que existan artefactos Stitch inmutables nuevos y el triple gate de diseño termine en `DESIGN=APPROVED`.

## Propósito y límites

Este documento traduce los briefs deterministas R6.x y el contrato Demo/Real a unidades de implementación. No amplía el alcance del backend, no inventa integraciones externas y no autoriza cambios bajo `frontend/src`.

Reglas obligatorias:

- Demo y Real comparten lenguaje visual, nunca autoridad ni promesas.
- Cada estado finito se modela como clase cerrada con constructor privado, instancias estáticas, `Unknown` y un único `fromWire` en el borde.
- Vista y store reciben tipos; no comparan strings ni traducen estados.
- Cada comando es un objeto con una responsabilidad, correlación e idempotencia cuando corresponda.
- Un valor `Unknown`, una lectura stale o un resultado incierto bloquean mutaciones hasta reconciliar.
- La UI Real sólo ofrece acciones respaldadas por los puertos existentes.

## Inventario reutilizable confirmado

- Rutas Real existentes: `/user/orders`, `/user/orders/:id`, `/user/inventory`, `/user/mercadolibre`, `/user/capabilities` y `/user/profile-import`.
- Rutas Demo existentes en `DemoScreen` para SC20–25. Falta declarar `/demo/user/customers` para SC26.
- SC20–21: `IOrderRepository`, `ListAdminOrdersUseCase`, `GetAdminOrderUseCase`, `AdvanceFulfillmentUseCase`, `FulfillmentStore` y `UserOrderDetailStore` ya separan lectura y mutación.
- SC22–24: `IUserRepository`, `ManageInstallationUseCase` e `InstallationStore` ya contienen las lecturas y comandos productivos permitidos.
- SC25: `ImportProfileUseCase` y `UserStore` ya soportan preview/merge y rechazo de secretos.
- Estados productivos cerrados existentes: pedido, pago, envío, transición de envío, RMA, transición RMA, rol, acción, capability, command status y cuenta Mercado Libre.
- Estados Demo cerrados existentes: pago, entrega, tabs ML, sincronización, confianza, frescura, devolución, alerta, escenario, contexto y módulo.
- El snapshot Demo ya posee un borde de rehidratación único. Debe mantenerse como única traducción de wire y reforzarse, no duplicarse en componentes.

## Matriz pantalla por pantalla

### SC-SURF-20 — Pedidos y entregas

- Rutas: `/demo/user/orders` y `/user/orders`.
- Reutilizar: `FulfillmentComponent`, `FulfillmentStore`, `ListAdminOrdersUseCase`, `AdvanceFulfillmentUseCase`, `IOrderRepository`.
- Agregar después de TASK-004: presenter/facade de filtros tipados; selección sólo Demo; exportador CSV Demo informativo; objetos de diálogo para tracking, confirmación, conflicto y resultado incierto; navegación de fila a detalle.
- Tipos a crear: `OrderQueueFilter`, `IncidentState`, `OrderSelectionState`, `FulfillmentCommandPhase` y `OrderQueueState`, todos con `Unknown` cuando reciban wire.
- Corte Real: sólo campos de `AdminOrder`, filtros derivados de esos campos, navegación y transiciones `advanceShipment`/`advanceRma`. Sin comprador, contacto, fecha, modalidad, domicilio, timeline, selección masiva o exportación fiscal.
- Pruebas mínimas: ledger de 12 filas Demo; filtros exactos; cero resultados compatible; tracking obligatorio; fallo preserva propuesta; conflicto no reenvía; Unknown bloquea; Real proyecta cinco filas sin datos sintéticos; foco/restauración del drawer y diálogo.

### SC-SURF-21 — Detalle operativo y posventa

- Rutas: `/demo/user/orders/:id` y `/user/orders/:id`.
- Reutilizar: `UserOrderDetailComponent`, `UserOrderDetailStore`, `GetAdminOrderUseCase`, `AdvanceFulfillmentUseCase`, tipos cerrados de shipment/RMA y agregados Demo de devolución.
- Agregar: flujo compuesto por objetos de paso independientes para recepción, inspección, disposición, ajuste de stock y reembolso simulado; cada paso expone precondición, comando y resultado, sin switch de strings en la vista.
- Tipos a crear/reforzar: `ReturnWorkflowStep`, `InspectionDecision`, `RefundCommandPhase`, `DetailRecoveryState` y `TargetCapability`.
- Corte Real: RMA de orden completa mediante la cadena existente; sin comandos de pago, reembolso, incidencia, devolución parcial o edición de tracking no soportada.
- Pruebas mínimas: baseline 2/0/0/0; devolución dañada aislada 6→7; reembolso exacto $84.500 separado de inspección; duplicado distinto de error recuperable; cancelación preserva snapshot; Real usa únicamente el lifecycle existente; grupos radio, foco y diálogos nombrados.

### SC-SURF-22 — Inventario

- Rutas: `/demo/user/inventory` y `/user/inventory`.
- Reutilizar: `UserInventoryComponent`, `InstallationStore.listInventory`, `ManageInstallationUseCase.listInventory` y el modelo Demo de productos, variantes, reservas y movimientos.
- Agregar: proyección tipada de balance; filtros cerrados; comandos Demo de ajuste y reconciliación con ID de operación; historial; conflicto concurrente; rechazo de invariantes; disponibilidad de outlet como hecho separado.
- Tipos a crear: `InventoryHealth`, `InventoryFilter`, `InventoryAdjustmentPhase`, `ReconciliationOutcome` y `InventoryTargetPolicy`.
- Corte Real: lectura de `availableQuantity`, `reservedQuantity` y `safetyStock`; sin derivar físico/no-vendible ni ofrecer ajuste, reconciliación o condición.
- Pruebas mínimas: cinco balances y totales 15/3/1/9; enteros obligatorios; reserva y no-vendible nunca exceden físico; operación idempotente; propuesta inválida/conflictiva se conserva; archivado y variante se respetan; Real es read-only.

### SC-SURF-23 — Mercado Libre

- Rutas: `/demo/user/mercadolibre` y `/user/mercadolibre`.
- Reutilizar: `UserMercadoLibreComponent`, `InstallationStore`, cuenta/listing productivos, `DemoMLTab`, `DemoMLConnectionStatus`, `DemoSyncStatus`, `DemoMatchConfidence` y `DemoObservationFreshness`.
- Agregar: presenter por pestaña; mapping editable; timeline correlacionada deseado→encolado→enviado→observado→confirmado/rechazado; candidato competitivo con decisión humana; recuperación stale/conflict/superseded.
- Tipos a crear: `ListingMappingPhase`, `SyncObservationPhase`, `CompetitionDecision`, `MarketplaceActionPolicy` y `ProviderEvidenceState`.
- Corte Real: leer cuenta y publicaciones; guardar mapping sólo con `accountId` numérico validado. OAuth, conectar/desconectar, mutar publicación, retry de jobs, actividad del proveedor y competencia permanecen Demo/deferred.
- Pruebas mínimas: conteos 5/4/3/1/1; `SYNC-003` 5/7; `CMP-001` exacto; ningún ACK inventado; confianza y freshness separadas; acciones ocultas por target; tabs y diálogos operables por teclado.

### SC-SURF-24 — Módulos del comercio

- Rutas: `/demo/user/capabilities` y `/user/capabilities`.
- Reutilizar: `UserCapabilitiesComponent`, `InstallationStore`, `ManageInstallationUseCase`, `CapabilityModuleId`, `CapabilityModuleState` y `CapabilityCommandStatus`.
- Agregar: metadata cerrada de disponibilidad y nivel de entrega; catálogo visual de siete fichas; navegación sólo hacia owners existentes; lifecycle explícito del comando; resultado confirmado, conflicto y resultado incierto como estados diferentes.
- Tipos a crear: `ModuleAvailability`, `DeliveryLevel`, `CapabilityMutationPhase`, `CapabilityTargetPolicy` y `OwnedSurfaceLink`.
- Corte Real: sólo dos IDs productivos aplicables al fixture, contrato existente y reconciliación por `correlationId` + lista fresca. Metadata visual nunca se envía al backend.
- Pruebas mínimas: siete fichas y tres ejes; CATALOG 7→8; cancelación no muta; doble submit imposible; timeout consulta el mismo correlation ID; Unknown/version null bloquean; OPERATOR sólo lee; módulos futuros no generan rutas.

### SC-SURF-25 — Configuración del comercio

- Rutas: `/demo/user/profile-import` y `/user/profile-import`.
- Reutilizar: `ProfileImportComponent`, `UserStore`, `ImportProfileUseCase`, `ProfileManifest` y sus validaciones de secretos.
- Agregar: settings Demo tipados con allowlist; preview/export/reset Demo; hash único compartido entre preview y merge; selección de diff cerrada; invalidación del preview al editar; estados de incompatibilidad, fallo y retry.
- Tipos a crear: `ProfileDiffKind`, `ProfileImportPhase`, `ConfigurationCommand`, `ConfigurationTargetPolicy` y `PreviewValidity`.
- Corte Real: schema `universal-tools-profile` 1.0.0, compatibilidad 1.x, `content.homeSections` y selección no vacía. Sin settings generales, export o reset Real.
- Pruebas mínimas: secretos rechazados antes del puerto; versión incompatible; diff `ADD/UPDATE/UNCHANGED/Unknown`; hash exacto preview/merge; editar invalida preview; selección vacía bloquea; fallo preserva manifest y selección.

### SC-SURF-26 — Administración de clientes

- Target: exclusivamente Demo. Ruta pendiente `/demo/user/customers`; no se crea `/user/customers`.
- Reutilizar: snapshot de actores, órdenes y sesiones Demo; `DemoContext`; joins por IDs.
- Agregar: `DemoScreen.Customers`; entrada de navegación visible según rol; feature/presenter/store Demo dedicado en vez de sumar responsabilidad a `DemoComponent`; búsqueda; resumen mínimo; deep-link al pedido; comando idempotente de restricción/reactivación y efectos explícitos sobre sesión/login/checkout.
- Tipos a crear: `CustomerAccountState` (`ACTIVE`, `RESTRICTED`, `Unknown`), `CustomerAdminFilter`, `CustomerAccountCommandPhase`, `CustomerTargetPolicy` y `CustomerSessionEffect`.
- Autoridad: ADMIN lee y escribe; OPERATOR lee; rol desconocido deniega. El cambio de cuenta no muta órdenes, pagos, devoluciones ni reembolsos.
- Pruebas mínimas: `customer-2209` enlaza `ORD-1015` por ID; búsqueda/empty/not-found; cancelar/repetir; fallo de lectura y escritura; propuesta preservada; reactivación; efecto de checkout; OPERATOR read-only; Unknown seguro; cero datos fiscales/identitarios inventados.

## Cambios transversales requeridos después del gate

### Hallazgos estrictos sobre el código actual

La revisión senior read-only no encontró un P1 demostrado, pero sí P2 que deben convertirse en reproducciones de TASK-005 y corregirse primero en TASK-006/007:

- SC20: `FulfillmentStore` no serializa/bloquea una mutación por pedido y el Demo todavía usa `DEMO-100..111`, no el ledger aprobado `ORD-*`.
- SC21: `RmaStatus.Requested`, `Approved` y `Rejected` ofrecen `Received`, aunque el contrato Real sólo habilita el encadenamiento documentado; `ShipmentStatus.Cancelled` ofrece `Packed`; además falta el guard de `PAID_STOCK_REVIEW`. La política se corrige en dominio y tests, no en la plantilla.
- SC21 Demo: `inspectReturn()` combina inspección, disposición y restitución. El flujo aprobado exige objetos/pasos separados y balance físico/no-vendible antes de reembolso.
- SC22 Demo: el modelo `onHand/reserved/active` no representa aún no-vendible ni los cinco balances aprobados; faltan conteo absoluto, reconciliación, propuesta preservada y reconfirmación tras conflicto.
- SC23 Real: `persistListing()` no expone busy/serialización ni aislamiento completo ante cambio de actor. Una respuesta tardía no puede limpiar el draft de un actor nuevo ni presentarse como cancelación del comando servidor.
- SC23 Demo: el procesamiento actual puede saltar directamente a `Confirmed`; debe conservar la secuencia deseado/queued/sent/observed/confirmed y el caso `SYNC-003` queued. La decisión competitiva necesita un tipo cerrado, no booleanos `enabled/resolved` como autoridad.
- Roles: la política actual restringe Capabilities Real a ADMIN y el contexto Demo no representa OPERATOR. Debe separarse lectura (ADMIN/OPERATOR) de mutación (ADMIN), con Unknown denegado en guard, navegación, dominio y tests.
- SC24 Demo: hoy existen cuatro módulos con `enabled:boolean`; deben migrarse a las siete fichas y tres ejes cerrados aprobados. Los módulos informativos no reciben ID productivo ni rutas inventadas.
- SC24 Real: el cambio se despacha sin confirmación contextual y el resultado reconciliado se aplana a error. Deben modelarse confirmación, pending, confirmed, version-conflict y result-uncertain preservando el UUID y la lista fresca existentes.
- SC24 async: `changeCapability` debe cancelar o descartar respuestas del actor anterior; un snapshot reconciliado tardío nunca puede repoblar la sesión nueva.
- SC25 Demo: el import/export actual basado en `title/subtitle` no es el contrato aprobado. Debe separarse configuración tipada, reset acotado e importador; el reset de configuración nunca puede resetear toda la Demo o cerrar sesión.
- SC25 Real: el diff crudo en `<pre>` y el merge sin selección explícita se reemplazan por operaciones cerradas `ADD/UPDATE/UNCHANGED/Unknown`, before/after, selección no vacía y confirmación accesible.
- SC26: además de no existir la ruta, el actor Demo no posee aún estado de cuenta. El agregado debe introducirlo con migración de snapshot y efectos acotados a sesión/login/checkout, sin mutar históricos.
- La evidencia responsive existente prueba ancho global y capturas, pero no paridad de datos/acciones, teclado del drawer ni WCAG AA completa. Esos puntos siguen siendo gates ejecutables, no inferencias.

Protecciones existentes que no deben perderse: concurrencia por pedido y respuestas tardías del detalle, rollback de snapshot Demo, adapters productivos y cortes read-only de inventario.

1. Extraer la lógica creciente de `DemoComponent` a feature facades/stores y comandos específicos; el componente conserva orquestación de vista, no dominio.
2. Crear un `SurfaceTarget` cerrado (`Demo`, `Real`, `Unknown`) y políticas tipadas por superficie. Ninguna vista decide capacidades comparando la URL como string.
3. Crear estados de carga cerrados (`Idle`, `Loading`, `Ready`, `Empty`, `Error`, `AccessDenied`, `Unknown`) y conservar el último snapshot válido durante recuperación.
4. Mantener adapters `fromWire` en data/demo persistence. Las plantillas sólo consumen label, tone, permitido y next del tipo.
5. Construir primitives compartidas: shell responsive, toolbar de filtros, tabla→cards, status chip accesible, empty/recovery state, drawer y diálogo con focus trap/restauración.
6. Asegurar navegación completa con teclado, Escape, foco visible, nombre accesible, `aria-live` sólo para resultados y contenido oculto fuera de tabulación.
7. Validar 390, 768 y 1440 px sin pérdida de columnas semánticas, CTAs, badges, rutas ni contexto de actor/target.

## Secuencia segura cuando TASK-004 cierre

1. `TASK-005`: preservar reproducciones y fixtures que justifican cada corrección.
2. `TASK-006`: implementar primero todos los tipos cerrados, `Unknown`, traductores y tests.
3. `TASK-007`: extraer stores/facades/comandos, persistencia Demo y políticas de target/rol.
4. `TASK-008`: tokens, primitives, shell, tabla/cards, drawer y diálogos.
5. En paralelo controlado: `TASK-013` (SC26), `TASK-015` (SC20–22) y `TASK-016` (SC23–25), sin compartir archivos editados entre agentes.
6. `TASK-017`: estados transversales, acceso, 404 y diálogos.
7. `TASK-018`: paridad productiva estrictamente limitada por bindings existentes.
8. `TASK-019..024`: CTA/E2E/visual/a11y, packaging, CI, code review, performance y security review.

## Gate de entrada a implementación

Debe existir evidencia verificable para cada SC20–26:

- artefacto Stitch inmutable A/B cuando aplique;
- doble revisión Astra visual con 0 P1 y 0 P2;
- prueba 390/768/1440 y teclado/foco;
- `design-manifest.json` actualizado con IDs y estado aprobado;
- `design-reviews.json` actualizado sin declarar aprobación documental como visual;
- `TASK-003=done` y `TASK-004=done`.

Hasta entonces, este readiness permite preparar y revisar el desarrollo, pero no modificar `frontend/src`.
