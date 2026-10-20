# FE-COMP-05 y composición transversal de Demo — PR #191

Fecha de preparación: 2026-10-20. Base exacta de #190:
`e57ded241cfc76d8922605d3f526483d1ffbabae`.
Rama nueva `codex/split-storecore-pr191`; fuente histórica conservada:
`integration/storecore-comp05-access-admin` en
`ffc54ba99607b86d1f4c0b6d8d1909f5817e4bfe`.
No se copia el árbol histórico ni se eliminan los módulos de #187–#190.
Commit de código validado:
`66622080fbcff09548e185b015a50a6ae55e7a42`.

## Implementación y procedencia

Los hunks exclusivos C05 aportan acceso, intención segura, recuperación local,
selección administrativa y validaciones de formularios. La composición adicional
conecta el catálogo, carrito/checkout, postventa, fulfillment, inbox y marketplace
ya publicados por los cortes previos. Sus tipos cerrados conservan identidad de
singleton; no se duplican catálogos de estados ni motores de reserva/reembolso.
El directorio de clientes agrega la ruta explícita `/demo/user/customers`:
25 rutas en total, con acceso administrativo, búsqueda, vacío, orden y paginación.
Los comandos de clientes, contenido, configuración y campañas se separan por
responsabilidad; el coordinador provee sus puertos. El tipo de orden administra
la regla de inserción reciente, nombre, importe y Unknown sin mutar los datos.

`DemoCommerce` suministra puertos con sesión cerrada y falla sin sesión por
defecto. Comprador y administrador son perfiles distintos: el perfil comprador
no habilita administración. Registro normaliza email y sólo asigna Customer.
Pagos pendientes requieren sesión propia o permiso administrativo explícito
antes de cualquier cambio, incluso cancelación repetida. Retry de pedido propio
rechazado/cancelado conserva SKU+variante y cotización histórica; si cambió el
precio exige confirmación del carrito antes de comprar.

`DemoRole`, `DemoCampaignState` y `DemoModuleState` poseen traducción única,
etiquetas y reglas; Unknown no autoriza cambios. Recuperación usa fases cerradas
y objetos de emisión, inspección y consumo. Es simulación local, sin correo,
credenciales, token real ni autenticación productiva.

`decodeSnapshot` es el borde del agregado y produce schema v6. Acepta v1/v4/v5
mediante upgrade explícito, luego restaura catálogo, checkout/reservas,
postventa, fulfillment, inbox y marketplace. v2/v3 se rechazan; no se inventa
soporte histórico. Una presentación legacy sin stock independiente exige
restablecer, no se asigna otra variante. Las ventas históricas con una sola
variante conservan replay sin volver a consumir. Los pedidos pagados conservan
sus líneas, importes y medios; `returned` no gobierna postventa.

Se corrigió una interacción de composición detectada por pruebas: inbox
reescribía la versión global a 5 durante reconcile. Ahora el esquema pertenece
al mapper/coordinador del agregado y se conserva v6 en persistencia y rollback.
El último endurecimiento rechaza identidades de módulo/campaña duplicadas
y variantes legacy explícitamente vacías: sólo una identidad ausente puede
traducirse desde el alias legacy documentado. No hay selección silenciosa de
otra variante ni discrepancia entre autorización y configuración duplicada.

Assets: el runtime/editor usa SVG locales existentes; no se importan los defaults
JPEG ausentes del corte de dominio. El adaptador de presentación usa el editor
canónico de catálogo y la postventa canónica con returns durables a nivel raíz.
Se compone la unidad Outlet VLD-043 del dominio: físico 1, no vendible 1,
disponibilidad 0, condición/defectos/garantía explícitos y SVG local. No permite
carrito, no tiene mapping automático y se excluye de la reposición comercial.
El ajuste valida previamente el máximo de una unidad y no altera balances al fallar.

## Evidencia local ejecutada durante preparación

- TypeScript app, demo y specs: PASS.
- Suite completa final con Outlet y guards de composición: 90 archivos /
  430 pruebas PASS.
- Focales de composición + marketplace + fulfillment + component: PASS; incluye
  el upgrade, los permisos, el replay y la retención Outlet.
- Arquitectura: 6/6 pruebas y scan PASS.
- Build productivo y build demo: PASS.
- Lint: PASS tras corregir el import sin uso detectado durante desarrollo.
- Browser C05: 7/7 PASS contra build de 19:04 UTC; aislamiento/ownership,
  recovery neutral/vencido/usado, duplicado/foco, cancelación/persistencia,
  paginación con 38 productos y teclado/Axe a 390/768/1440.
- Browser completo final: 51/51 PASS; expected 51, skipped 0, unexpected 0,
  flaky 0 y errors vacíos. Build demo 2026-10-20 19:13 UTC; ejecución desde
  19:13:08 UTC, duración 229348.84 ms. Incluye comprador/admin/comprador,
  aislamiento/recarga, edición y cancelación, reservas/pagos/reintento,
  postventa completa, entrega/retiro/incidencias, marketplace, configuración,
  directorio Customers, Outlet retenido, teclado, responsive y Axe en las
  superficies declaradas por los escenarios a 390/768/1440.
- Reporte local ignorado por Git: `frontend/demo-playwright-report/results.json`;
  screenshots y trazas: `frontend/test-results/`. El pase focal C05 adicional
  se conserva en `outputs/access-admin-focused-20261020/`.
- G-D estructural local: seis tareas únicas, dependencias en orden topológico,
  16 referencias de aceptación y enlaces de evidencia válidos.
- No se reutilizan los 359/359 y 56/56 históricos como evidencia del nuevo corte.

Los comandos Angular se ejecutan fuera del sandbox tras aprobación del entorno:
esbuild no puede resolver directorios desde la raíz C: dentro del sandbox.
Dependencias temporales: junction node_modules hacia el checkout #187; se retira
antes de la entrega y quedó retirado tras los gates, preservando el directorio
de dependencias original. No hay cambios de paquetes/lockfiles.

## Correcciones de revisión local — 2026-10-20

Sobre el corte local `d1216b088f18310019c4eec4cb6d71f26cbee23b`,
`DemoVariantReferenceIndex` indexa identidades compuestas SKU+variante sin
depender de estados ni de UI. El comando `saveProduct` impide eliminar o
reemplazar variantes referenciadas antes de mutar catálogo/reservas. Conserva
referencias de carritos, líneas de pedido, reservas, movimientos, devoluciones,
mapping y cola de marketplace, y detalles de competencia, incluso históricos.
No introduce tombstones. El mismo índice valida el catálogo al decodificar y
rechaza snapshots con referencias huérfanas. Las pruebas ejercen directamente
saveProduct, atomicidad del rechazo, recarga y wire corrupto por cada referencia;
permiten eliminar una variante realmente libre y editar datos sin cambiar una
línea histórica pagada.

`DemoCustomerOrderFilter` separa el parámetro `customerId` validado de la
búsqueda textual `q`. Sólo acepta una identidad exacta de un actor Customer;
Unknown no coincide con pedidos. La selección compara `order.actor === id`,
incluyendo colas y alertas en contexto de cliente. El directorio no usa el ID
como texto de búsqueda: cliente y cliente2 se mantienen aislados.

PDP muestra atributos y garantía configurada del producto. Postventa obtiene
etiqueta, atributos e importe desde la línea congelada del pedido original por
SKU+variantId, nunca del catálogo editado ni de la primera variante. El contrato
canónico llama `unit` a ese importe comprado (`quotedUnit` pertenece al carrito).
El browser reproduce dos variantes tras editar catálogo, a 390/768/1440 con Axe,
además de garantía configurada y separación exacta de clientes.

Validación final de esta corrección (no sustituye evidencia de CI/revisión):

- Focal CORE: 2 archivos / 23 pruebas PASS.
- Suite completa: 92 archivos / 455 pruebas PASS; lint completo y ngc PASS.
- TypeScript app/demo/spec y arquitectura 6/6 + scan PASS.
- Demo build: PASS, 2026-10-20 19:32:30.877 UTC.
- Build productivo: PASS, 2026-10-20 19:34:32.797 UTC.
- Browser focal de regresión: 5/5 PASS. Browser completo final: 56/56 PASS,
  expected 56, skipped 0, unexpected 0, flaky 0, errors vacíos. Inicio
  2026-10-20 19:32:31.516 UTC, duración 223997.118 ms. Fuente congelada sin
  cambios posteriores al build demo; sólo se actualizó documentación después.
- `git diff --check`: PASS. Runner y servidor finalizados; junction temporal
  retirada al cerrar los gates, conservando node_modules de #187.

## Correcciones NO-GO de seguridad — 2026-10-20

Sobre `bfd7a2113a07c834b1986a85f2154bcd8c93b153`, el decoder v6 exige
unicidad global de RMA mediante `DemoReturnIdentity` inmediatamente después de
traducir returns y antes de `validateOrder`. Dos pedidos del mismo comprador o
de compradores distintos no pueden compartir ID. Las pruebas espían el orden de
validación y verifican rechazo sin mutación de la fuente. Los comandos validan
el agregado antes de buscar o repetir una solicitud, y verifican el nuevo ID
antes de insertarlo: una identidad ambigua falla cerrada sin cambiar historial,
estado, inventario ni revisión.

El parser de intención usa la tabla cerrada `DemoScreen`, excluyendo login y
registro para evitar ciclos. Cada segmento debe coincidir exactamente; los
parámetros admiten sólo identidades ASCII acotadas a 128 caracteres. Se cubren
explícitamente `/demo/catalog`, `/demo/user/orders/:id` y
`/demo/user/mercadolibre`, sin patrones arbitrarios, queries, fragments,
traversal ni redirects externos. La política exige actor/rol/contexto coherente,
admin para USER y pedido existente para detalle administrativo. Un comprador
no se reescribe a una ruta USER; vuelve al home. CUSTOMER conserva ownership
exacto de su pedido, incluso después de login frío y recarga.

Gates de esta corrección sobre fuente congelada:

- Focal CORE + composición + comandos postventa: 3 archivos / 51 pruebas PASS.
- Unit completo: 93 archivos / 471 pruebas PASS.
- Lint completo, TypeScript app/demo/spec, `ngc --noEmit` y arquitectura
  6/6 + scan: PASS.
- Demo build: PASS, 2026-10-20 19:42:18.462 UTC; sólo el nuevo spec CORE se
  completó después del build, sin cambios productivos posteriores.
- Build productivo: PASS, 2026-10-20 19:43:30.048 UTC.
- Browser focal de intención: 12/12 PASS. Browser completo: 68/68 PASS,
  expected 68, skipped 0, unexpected 0, flaky 0 y errors vacíos. Inicio
  2026-10-20 19:43:10.578 UTC, duración 230830.241 ms. Sin cambios productivos
  ni helpers browser posteriores al build demo. `git diff --check`: PASS.
- Runner y servidor cerrados; junction temporal retirada al finalizar,
  conservando las dependencias originales de #187. No hay cambios de paquetes.

## Estado de entrega actual

Estado actual: implemented_local_pending_independent_review_and_ci.
Faltan la re-revisión independiente y CI sobre el SHA final publicado.
No se declara CI verde, merge-ready, deploy, integración live, OAuth, scraping,
cobro real, settlement, refund bancario ni homologación fiscal.
La validación de #190 no acredita automáticamente este diff.
No se publica ni se hace push en esta preparación. Runner final terminado y
puerto 4390 sin listener después de la validación.
