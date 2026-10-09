# Contrato técnico

## Composición y aislamiento

### Adaptación aprobada de composición — 2026-10-08

La composición demo usa `src/main.demo.ts`, `index.demo.html` y rutas bajo `/demo` con shell comercial dedicado. La composición HTTP permanece íntegra en `src/main.ts`/`app.config.ts`; no se agrega fallback. Se reutilizan los tipos canónicos OrderStatus, PaymentStatus y ShipmentStatus. Las operaciones nuevas de demostración usan `DemoCommerce` y `DemoApplicationState`, porque los puertos heredados no expresan quitar/editar carrito, ajustar inventario o simular ventas ML. Esto reemplaza la obligación de forzar adaptadores a cada puerto existente y de reutilizar cada componente de presentación. No hay HttpClient en el grafo demo ni dependencias a auth/cookies/CSRF productivos. El inventario de rutas original se conserva con prefijo `/demo`.

Mantener `app.config.ts` HTTP por defecto. Crear entrada/configuración Angular demo explícita (comando dedicado y composición de providers) que vincula todos los tokens de repositorio actuales a adaptadores demo: ACCESS, HEALTH, CATALOG, CUSTOMER, CART, ORDER, USER y OFFER. Revisar además cualquier HttpClient directo: la demo no puede escapar a red mediante un servicio no sustituido. Un único `DemoApplicationState` y coordinador de transacciones sirven a todos los repositorios; no una copia independiente por pantalla.

Las rutas existentes, guards, casos de uso y componentes se reutilizan. Si una capacidad aún carece de puerto, definir contrato frontend pequeño y adaptador demo; producción la presenta según su soporte real, sin endpoint inventado ni éxito falso. Configuración demo no puede activarse por query string, error HTTP, usuario o localStorage del build productivo. Banner y selector/reset de escenarios solo en composición demo. Assets locales; tests bloquean cualquier request API/proveedor externo en demo. Build producción verifica que no selecciona providers demo.

## Estado, contratos y persistencia

Dominio framework-free; reutilizar OrderStatus, PaymentStatus, ShipmentStatus, RmaStatus, UserAction y tipos UA existentes. Todo conjunto finito nuevo (escenario, fase checkout, modo, operación/resultado de simulación) usa clase TS constructor privado, instancias estáticas, `fromWire` único y Unknown. Etiquetas y elegibilidad residen en el tipo/política; vistas, stores y tests consumen casos, sin switches de strings.

Fixtures JSON versionadas entran por un solo traductor. Validar relaciones y montos; valores desconocidos producen Unknown e impiden transiciones. Cada paso del checkout es objeto de responsabilidad única, ordenado por un coordinador. No duplicar reglas de transición entre pantalla y repositorio.

Persistir snapshot demo versionado en almacenamiento local con namespace exclusivo y revision; solo datos sintéticos. Lectura inválida muestra recuperación/reset, sin interpretarla como sesión real. Sesión/contexto demo aislados de cookies/CSRF reales; logout borra identidad y estado privado en memoria, sin borrar compras del comercio. Cambiar actor carga su carrito/direcciones/historial. El coordinador aplica mutaciones serializadas, valida stock/precios/revision antes de confirmar y publica una sola nueva revisión. Ante pestaña con snapshot viejo, recargar o avisar conflicto; no sobrescribir silenciosamente. Reset confirmado crea seed nuevo y limpia contexto demo, sin tocar almacenamiento productivo.

Inventario modela onHand/reserved/available y ledger sintético de operaciones identificadas. Pago aprobado consume reserva una vez; rechazo libera una vez. Request id y operación registrada hacen idempotente el reintento. Los totales usan unidades monetarias menores, no acumulación flotante. Fechas/ids provienen de Clock/IdSource inyectables para reproducibilidad. Estado loading y errores de simulación se controlan por escenario tipado, no random.

## Frontera productiva

No alterar cookies, CSRF, guards reales, colas UA, aislamiento de actor, adapters HTTP ni contrato server para facilitar demo. Tests existentes de UA y mapping siguen obligatorios. La demo no satisface FE04 E01–E09 contra Spring/PostgreSQL. Meli, pagos, correo/fiscal y competidores se simulan exclusivamente en demo; la UI expresa esta condición antes y después de acciones externas.

## Evidencia

Playwright recorre composición demo sin servidor backend, bloquea APIs externas, captura errores console/page/network y relaciona routeId/ctaId/escenario/assertion. Una acción aprobada exige assert sobre navegación/estado observable y sobre no-duplicación cuando muta; screenshot solo no demuestra funcionamiento. Inspección DOM compara elementos interactivos con inventario: no registrar dos botones diferentes bajo un ID genérico. Controles de formularios se verifican por formulario y casos de validación; todo submit, enlace y acción de menú sí tiene ID propio.

Suite separada HTTP mantiene mocks de contrato y regresiones UA; build productivo y demo, unitarias de traductores/transiciones y pruebas Playwright demo+axe. Registrar SHA, comando, navegador, viewport, resultado y artefacto. Review funcional/diseño y review código/seguridad independientes sobre SHA final; todo hallazgo corregido requiere prueba dirigida y nueva revisión.
