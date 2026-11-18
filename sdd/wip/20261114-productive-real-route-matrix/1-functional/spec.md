# Spec funcional — matriz productiva real

## Problema

StoreCore posee journeys reales focales y una aceptación exhaustiva de router con
`HTTP_FIXTURE`, pero no una matriz reproducible de cada ruta actual contra la API
real. El issue #106 conserva el conteo histórico de 22 pantallas; el router de la
base actual contiene 30 leaves, cuatro redirects y tres wildcards. El censo del
router es la autoridad ejecutable y el inventario visual histórico conserva sólo
la procedencia de producto.

El runner PSD existente tampoco puede considerarse evidencia fresca: el checkout
vigente exige revisiones autoritativas de carrito y dirección, y V22 deja los
métodos manuales de entrega deshabilitados hasta configurar su política.

## Principios de aceptación

- Cada leaf productivo aparece exactamente una vez en el censo canónico y tiene
  un binding real explícito; redirects y wildcards se aceptan aparte.
- Cada binding declara actor, rol cuando corresponde, escenario, URL obtenida de
  datos persistidos, identidad de superficie, heading, readiness y acciones.
- `Unknown`, duplicados, faltantes, bindings huérfanos o identidades sintéticas
  `ROUTE-*` invalidan el gate real.
- Una ruta protegida se acepta con su sesión real y sus datos poblados. La
  redirección anónima es una prueba negativa adicional, nunca un reemplazo.
- Un estado externo desconfigurado o deshabilitado es válido si la UI lo presenta
  honestamente. No se fabrican sincronizaciones, cobros ni acreditaciones.
- Las acciones mutables se ejecutan una sola vez en journeys aislados y se
  verifican mediante readback o recarga. No se repiten por viewport.
- Toda fila de acción declara `REAL_BACKEND` o
  `REAL_BACKEND_LOCAL_PROVIDER`; la segunda exige proveedor local controlado y
  no acredita integración externa.
- El recorrido visual se ejecuta a 390, 768 y 1440 px sobre datos reales.

## Familias y acciones mínimas

### Público y acceso

- `/`, `/catalog`, `/catalog/:sku`: composición publicada, catálogo y producto
  persistidos; búsqueda/filtros e identidad de variante/precio coherentes.
- `/login`, `/recover`, `/reset-password`, `/verify-email`,
  `/customer/register`: separación de contextos, errores genéricos y secretos
  inválidos. El registro crea por UI un CUSTOMER sintético único, verifica su
  persistencia mediante login posterior, cookie CUSTOMER real y ausencia de
  autoridad USER. Los casos válidos de recovery pueden reutilizar entrega local
  controlada, sin afirmar SMTP productivo.

### Comprador

- `/customer/profile`: editar, guardar y recargar.
- `/customer/addresses`: alta/edición/baja y ownership.
- `/customer/favorites`: agregar/quitar y leer nuevamente.
- `/cart`: agregar, cambiar cantidad y validar precio/stock autoritativos.
- `/checkout`: seleccionar entrega configurada, congelar revisiones y crear orden.
- `/checkout/result/:orderId`: mostrar pedido creado sin afirmar pago acreditado.
- `/customer/orders` y detalle: misma orden persistida y rechazo de orden ajena.

### Operación

- `/user/account` y `/user/home`: identidad, rol, período y métricas coherentes.
- `/user/settings` y `/user/content`: persistir, recargar y reflejar marca/contenido
  público; un conflicto de revisión no sobrescribe.
- `/user/catalog` y `/user/inventory`: producto/variante real y ajuste de stock por
  el flujo autorizado, sin transferir autoridad de inventario al catálogo.
- `/user/offers` y `/user/promos`: crear y transicionar un caso local permitido.
- `/user/customers`: ADMIN suspende/reactiva; OPERATOR sólo lee; sesiones viejas
  permanecen revocadas.
- `/user/orders` y detalle: en la matriz estricta, el pedido pendiente no
  acreditado presenta acciones bloqueadas y el backend rechaza la transición.
  La orden elegible y su siguiente transición pertenecen a un journey separado
  `REAL_BACKEND_LOCAL_PROVIDER`, con proveedor oficial local controlado y
  clasificación visible; nunca se contabiliza como evidencia sin simulación.
- `/user/mercadolibre`: estado real deshabilitado/desconfigurado, sin actividad
  inventada.
- `/user/capabilities`: lectura real, permisos ADMIN/OPERATOR y comandos locales
  permitidos; integraciones externas permanecen deshabilitadas.
- `/user/profile-import`: preview compatible, bloqueo incompatible, merge explícito
  y readback.

## UX y accesibilidad

Cada ruta acredita URL final, `SurfaceIdentity`, un único `h1`, recurso exacto del
receipt, fin de las lecturas necesarias y ausencia de loading/error inesperados.
Se bloquean violaciones Axe `serious`/`critical`, overflow del documento y tablas
desbordadas sin región accesible/foco. Se comprueban skip link utilizable,
navegación por teclado, labels, foco/restauración de diálogos y anuncios de
resultado en las acciones críticas.

## Actores y seguridad

- Anónimo, CUSTOMER dueño, CUSTOMER ajeno, USER ADMIN y USER OPERATOR usan
  contextos de navegador independientes.
- Cookies Secure/HttpOnly/SameSite y separación de realms se verifican.
- Ownership, 401, 403, CSRF cruzado y logout por realm tienen aceptación real.
- Los tests no conservan storage state, cookies, CSRF ni secretos como artefactos.

## Criterios de cierre

- 30 leaves actuales por tres viewports: 90 aceptaciones reales, sin skips.
- Cuatro redirects y tres wildcards aceptados explícitamente.
- Matriz ruta/rol/acción completa y acciones críticas con persistencia/readback.
- Fixture inicial y replay estables; inventario, ledger, pedidos y datos ajenos no
  se duplican ni se restauran destructivamente.
- Cero interceptores de API en esta matriz estricta.
- CI, reviews independientes y post-merge verdes sobre el mismo SHA.

## Fuera de alcance

Proveedores live, acreditación de pagos, fiscalidad, carriers, companion POS,
tenancy, deploy, release y `sdd.finish` global del producto.
