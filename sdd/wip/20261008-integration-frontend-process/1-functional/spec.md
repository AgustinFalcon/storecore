# Contrato funcional INT-FE

## Resultado esperado

Cada ruta y acción web tiene requisito, adapter HTTP, autorización, persistencia y prueba identificados. Un control sin contrato real debe declararse pendiente y no presentarse como función productiva. “100% local” significa completar el alcance web aprobado y sus gates, no completar servicios externos.

- INT-R01: conservar catálogo, home, ofertas, inventario, pagos/órdenes, POSC/DSP y estados cerrados de integración. No merge masivo desde master.
- INT-R02: lectura y comandos capability tipados con versión esperada, correlación, motivo, CSRF y recuperación autoritativa; ADMIN escribe, OPERATOR no adquiere permisos nuevos.
- INT-R03: entrada pública /login, selección sólo de contextos verificados, cookies/CSRF CUSTOMER y USER separados; return path allowlisted. Logout, revocación, carreras de probe/login y cambio de actor no trasladan autoridad ni carrito entre contextos.
- INT-R04: port manual CFE; backend decide pago acreditado/consumo WEB y secuencia de fulfillment. Unknown no habilita controles. RMA recibe una sola vez; inspección, ajuste y restock automáticos siguen diferidos.
- INT-R05: ofertas de vitrina completas: alta/edición según contrato existente, estado/aprobación, pausa/fin, vigencia/timezone/prioridad/margen/SKU, precio efectivo del servidor y snapshots de checkout. Promos MANUAL de canal siguen separadas.
- INT-R06: favoritos CUSTOMER productivos requieren mini-SDD, dominio/repositorio/HTTP, ownership y persistencia por cuenta. El corazón/sessionStorage actual sólo conserva una pestaña y no demuestra sincronización ni persistencia CUSTOMER.
- INT-R07: manifest igual a todas las rutas runtime, estados loading/empty/error/retry/Unknown, navegación responsive/teclado y axe sin serious/critical. RealLocal separado de MockHttp y FixtureOnly.
- INT-R08: aceptación local exige respuesta, GET tras reload y persistencia concordantes; CI y reviews corresponden al SHA evaluado. Un test no ejecutado es NOT_RUN, nunca PASS.

## Alcance conservado

Single-tenant por instalación; perfiles configurables; sin credenciales, precios, SKU o merchant hardcodeados en producción. Los fixtures usan datos aislados explícitos. Container → view → store → use case → HTTP repository. Dominio sin Angular/Spring/HTTP.

Todos los conjuntos finitos del nuevo trabajo son enum/sealed Kotlin o clase TypeScript con constructor privado, casos estáticos, regla/etiqueta y un único fromWire. JSON/DB se traducen en el borde; Unknown seguro. Pasos de login objetos con responsabilidad única y recorrido extensible.

## INT-FE-03: contrato de aceptación frontend

El [contrato UA frontend](../4-implementation/int-fe03-unified-access-frontend.md)
define A01–A09: login/selección, reload de sesiones independientes, revocación,
cambio de actor, interlock de writes/CSRF, destinos seguros, regresiones y browser
real. Es especificación `documented_for_review`; ninguna aceptación ejecutada.
`/login` y `/user/home` son rutas propuestas, no hojas runtime de esta base.
Entradas legacy se redirigen durante el futuro port sin eliminar endpoints backend.
Una preferencia local de contexto nunca equivale a sesión autenticada. El contexto
USER no habilita writes CUSTOMER aunque ambas cookies existan en el navegador.

## INT-FE-04: contrato previo de commerce y fulfillment

Sobre FE03 `41dcfb3ff099a4ca162c4c11fe75e4609826b1a8`, el
[contrato CFE E01–E09](../4-implementation/int-fe04-commerce-fulfillment.md)
exige acreditación y consumo WEB SALE exacto antes de Packed/Shipped/Delivered;
una recepción RMA no repone stock ni ejecuta inspección/ajuste. Backend decide
elegibilidad y acciones en la transacción; Unknown nunca habilita botones.
Se extienden los tipos cerrados existentes, sin duplicarlos. ReturnDestination
agrega sólo CustomerCart/CustomerCheckout; resultado frío vuelve a CustomerOrders.
El corte documental está para review: implementación y E01–E09 NOT_RUN.
Las referencias FE03 anteriores a rutas propuestas describen su base histórica;
en este SHA `/login` y `/user/home` ya son hojas runtime y session es redirect.

## Exclusiones vigentes

No pago real MP-LIVE-05, fiscal/ARCA, carrier/Correo live, activación ML/POS companion, dispatcher ML, SaaS, tenancy ni loyalty. La simulación del puerto externo de pago sólo valida wiring local. El dossier externo permanece NO-GO.
