# INT-FE-04 — Commerce y fulfillment, contrato previo al port

Estado: `documented_for_review`. Base exacta FE03/PR #181:
`41dcfb3ff099a4ca162c4c11fe75e4609826b1a8`. Rama documental:
`integration/storecore-commerce-fulfillment-sdd`. No incluye candidatos locales
posteriores a ese SHA. Este documento no acredita implementación, aceptación,
review, CI ni integración de FE03 o CFE. E01–E09: **NOT_RUN**.

## Objetivo y autoridad

Una orden sólo progresa por Packed → Shipped → Delivered cuando el backend
verifica pago acreditado y consumo WEB SALE exacto de sus líneas. Una redirección
checkoutUrl, estado de pantalla, fixture o actualización SQL aislada no acredita
un pago. Recepción de devolución una sola vez, después de Delivered, por las
cantidades originales; no inspección, ajuste, reposición ni devolución automática
de dinero. INSPECTED/ADJUSTED históricos siguen legibles pero no ejecutables.

El backend vuelve a verificar elegibilidad y siguiente acción dentro de la
transacción de cada comando; el hint GET nunca concede autoridad. Ausencia,
ambigüedad o Unknown, evidencia de otra orden/attempt, moneda o importe distinto,
consumo parcial/excedido, reversión y PAID_STOCK_REVIEW cierran las acciones.
Verificar variante y cantidad, no sólo totales agregados. Preservar consumo
idempotente, snapshots de precio/descuento y hooks de proyección DSP/BlackStore.

## Baseline observado y contrato de borde

En esta base existen OrderStatus, PaymentStatus, ShipmentStatus, RmaStatus y sus
transiciones cerradas en Kotlin y TypeScript. Commerce.kt todavía declara strings
en OrderView/CheckoutReceipt. El backend expone nextShipAction/nextRmaAction; el
AdminOrder frontend no los incorpora y fulfillment-transition deriva acciones
localmente. No existe elegibilidad acreditada en ese DTO. Por eso B precede T/U.

- Conservar GET `/api/v1/user/orders` y `/{id}`, POST `/{id}/shipments`
  (status, tracking opcional) y `/{id}/rma` (status), sin endpoints inventados.
- DTO administrativo debe ofrecer elegibilidad y las acciones autorizadas. En
  dominio/frontend son `eligibility`, `shipmentAction`, `rmaAction`; el mapper
  traduce los nombres wire existentes `nextShipAction`/`nextRmaAction`, sin
  renombrarlos silenciosamente. El nuevo campo wire `eligibility` es aditivo y
  debe fijarse con tests de serialización en B antes de T.
- Extender las clases existentes y agregar únicamente FulfillmentEligibility
  como nuevo tipo de estado de este corte; no copiar `commerce-states.ts`.
  Definir sus casos cerrados/bloqueos y serialización en B/T, incluidos Unknown
  y el caso habilitado. Sólo el caso habilitado conocido permite una transición
  conocida; ausencia de campo antiguo equivale a Unknown, nunca habilitación.
- Dominio Kotlin usa enum/sealed y dominio TS constructor privado, instancias
  estáticas, reglas/etiquetas en el tipo. Un traductor por borde wire/DB; no
  strings de estado en store, vistas, tests de pantalla ni servicios de dominio.
  La recepción de input inválido rechaza el comando sin efectos.
- CUSTOMER GET `/api/v1/customer/orders` y `/{id}` mantienen ownership y no
  exponen acciones administrativas ni evidencia interna. Checkout conserva
  `/api/v1/customer/checkout`; su receipt tipado no promete pago aprobado.
- Timeout/error incierto no genera reenvío automático: GET autoritativo bajo
  el mismo actor, luego nueva decisión. Conflicto de secuencia/replay no añade
  eventos ni cambia stock. Preservar envelope/errores existentes, probarlos en B.

## ReturnDestination y sesión

Extender el tipo existente sólo con CustomerCart y CustomerCheckout para rutas
exactas `/cart` y `/checkout`, permitidas únicamente en contexto CUSTOMER.
Entrada fría a `/checkout/result/:orderId` vuelve a CustomerOrders tras login;
no conservar un ID arbitrario en returnTo ni fabricar un destino dinámico.
Un futuro destino dinámico exige contrato separado, validación y ownership real.
URLs externas, encoded paths, query/hash y destinos desconocidos fallan cerrados.

Mantener coordinator UA, SessionMutationQueue por realm, generaciones de actor y
CustomerCartAccess. Cart/checkout requieren CUSTOMER verificado, aunque exista
cookie USER; órdenes admin requieren USER autorizado. Cada write se encola y
captura autoridad/CSRF vigente; logout, revocación o cambio A→B invalidan trabajo
pendiente y respuestas tardías. Renovar CSRF de forma serializada con las demás
mutaciones del mismo realm. Una navegación de detalle invalida respuestas de
la orden anterior mediante identidad/generación ya existente; no resucitar datos
ni comandos tras abandonar ruta. Backend conserva Origin, rol, capability y
IdentityMutationCoordinator incluso si la UI oculta el botón.

## Allowlist por hunks y no-touch

Port manual de la referencia #171/#173 `a653f45af977ad989b62a48ec01a363646207aaf`;
la referencia es material para comparación, nunca baseline ni merge masivo.

- D: sólo este WIP, sus contratos, inventario, tareas y evidencia documental.
- B: `backend/src/main/kotlin/com/storecore/commerce/domain/` para tipos/política;
  `commerce/application/` sólo contratos/evidencia; infraestructura
  Commerce/JdbcOrderService/JdbcCartService/OrderController y callers mporders
  sólo hunks de tipado, acreditación, lectura de evidencia y transacción CFE;
  pruebas correspondientes bajo `backend/src/test/`.
- T: `frontend/src/app/domain/order/`, contratos cart/checkout afectados,
  `data/order/order-http.repository.ts`, `data/cart/cart-http.repository.ts`,
  `domain/access/return-destination.ts` y sus tests/mappers.
- U: consumers cart/checkout/result, orders customer, admin fulfillment/detail,
  pruebas focales; wiring/guards sólo para destinos cerrados anteriores.
- E: pruebas backend/browser CFE, manifest/fixtures sólo donde cambie contrato,
  documentación de ejecución y evidencia dentro de este WIP.

No reemplazar archivos de servicio completos ni copiar migraciones master.
V1..V21/checksums, ACL/retirement V20, V21 challenges, POSC/DSP/lock order,
inbox/worker/SALE, home blocks, ofertas, capability commands/correlation y
favoritos de pestaña se preservan. No editar UA coordinator/queues, lógica de
CustomerCartAccess o generaciones del detalle para acomodar CFE; si surge una
necesidad real fuera de allowlist, documentar delta y revisar antes del cambio.
No nueva migración prevista. Cualquier DDL necesario requiere contrato revisado,
número libre verificado, clean+upgrade; nunca repair ni checksum rewrite.

## Aceptación E01–E09

Todos los escenarios están NOT_RUN en D; cada ejecución registra SHA FE/BE,
comando, origin HTTPS/host único, DB aislada, conteos, artifact y modo de evidencia.

- E01: checkout pendiente; shipment/RMA y actor CUSTOMER administrativo
  rechazados, sin cambios en eventos, stock ni ledger; GET tras reload concuerda.
- E02: estados bloqueados/Unknown, pago ausente/ambiguo, evidencia/ownership
  ajenos, moneda/importe incorrectos cierran acciones. Unknown imposible por
  constraints se prueba como unit/MockHttp, sin presentarlo como caso DB real.
- E03: proveedor fake en puerto externo → inbox/worker reales → acreditación
  y SALE → Packed/Shipped/Delivered; comprobar respuesta, GET/reload, fechas,
  eventos y cantidades durables. No sembrar PAID como sustituto del recorrido.
- E04: expiración y re-reserve conservan variantes/cantidades exactas; rechazo
  de parcial/exceso/PAID_STOCK_REVIEW, sin segundo consumo ni proyección indebida.
- E05: dos operadores, replay/fuera de orden y RMA antes de Delivered; máximo
  un efecto por transición, sin duplicar shipment/return/events.
- E06: pago/reversión/terminación concurrentes, rollback tras primer write,
  timeout+GET+retry, lock order y rotación CSRF; cambio actor A→B y navegación
  entre detalles descartan respuestas/comandos anteriores y no filtran datos.
- E07: una recepción con líneas/cantidades originales; rechazar duplicado,
  INSPECTED/ADJUSTED incluso históricos; balances y ledger sin reposición.
- E08: sesión/rol/capability disabled/read-only, Origin/CSRF y ownership negativos;
  coexistencia USER/CUSTOMER no eleva permisos ni habilita cart/checkout USER.
- E09: Flyway clean y upgrade desde baseline con checksums V1..V21 intactos;
  Angular real HTTPS → Spring real → PostgreSQL real y reload sin intercept API.
  El proveedor de pago es el único fake permitido en esta aceptación.

## Secuencia de PR y gates

FE04-D → FE04-B → FE04-T → FE04-U → FE04-E. Cada paso depende del anterior y
del gate/review aplicable; D no autoriza implementación ni acredita FE03 aceptado.
B valida política/transacción/HTTP/DB y regresiones de worker/locks antes de UI;
T valida tipos, traductores y Unknown; U valida cola/CSRF/actor/ruta, return paths
y UX; E reúne E01–E09 con suites completas, arquitectura/lint/unit/build,
manifest/runtime exacto, axe sin serious/critical y pruebas RealLocal.

MockHttp y FixtureOnly se registran aparte. JDK/toolchain, PostgreSQL/HTTPS,
CI y reviews deben corresponder al SHA evaluado; fallo de infraestructura es
BLOCKED y prueba no ejecutada es NOT_RUN. Cada PR requiere las revisiones de
repositorio antes de merge; ningún PASS local satisface solo ese gate. Sin push,
PR ni merge en D local. No master, release, deploy, sdd.finish, MP-LIVE-05,
carriers/fiscal/ML/POS live, nuevos secretos ni dinero real.
