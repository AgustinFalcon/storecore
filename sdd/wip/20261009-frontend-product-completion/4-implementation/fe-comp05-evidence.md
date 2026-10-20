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

## Gates y límites

Estado actual: implemented_local_pending_independent_review_and_ci.
Faltan la re-revisión independiente y CI sobre el SHA final publicado.
No se declara CI verde, merge-ready, deploy, integración live, OAuth, scraping,
cobro real, settlement, refund bancario ni homologación fiscal.
La validación de #190 no acredita automáticamente este diff.
No se publica ni se hace push en esta preparación. Runner final terminado y
puerto 4390 sin listener después de la validación.
