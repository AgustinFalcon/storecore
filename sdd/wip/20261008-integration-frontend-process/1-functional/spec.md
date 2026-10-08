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

## Exclusiones

No pago real MP-LIVE-05, fiscal/ARCA, carrier/Correo live, activación ML/POS companion, dispatcher ML, SaaS, tenancy ni loyalty. La simulación del puerto externo de pago sólo valida wiring local. El dossier externo permanece NO-GO.
