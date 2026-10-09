# Evidencia y pendientes

Documento de planificación, 2026-10-08. Base inspeccionada `ef21e612d13a2b104dd7c96fb1f97ae4e7ca8ce2`: app.routes.ts tiene 24 rutas hoja y app.config.ts enlaza ocho repositorios HTTP. Este commit no contiene implementación, resultado de tests de producto, review aprobada ni capturas.

Inventario inicial define grupos de acciones exigidos por ruta; falta reconciliación de CTA concretos con implementación final y DOM. Todos E01–E10: NOT_RUN. DEMO-B/T/U1/U2/E: pendientes. No cierre de SDD, master, release, integración real ni homologación.

Por cada entrega agregar SHA/base, rutas/CTA cubiertos/total, comandos/resultados, screenshots desktop/mobile, hallazgos y correcciones, review funcional/diseño, review código/seguridad y residuales reales. No convertir acciones simuladas en evidencia backend.

## Primer corte comercial implementado — 2026-10-08

Base documental aprobada `0a57e0cc`; branch `feat/commercial-demo-frontend`; worktree `work/storecore-commercial-demo-implementation`. Entrada compilada separada `main.demo.ts`, rutas `/demo`, snapshot local versionado compartido. El build productivo y el HTTP/auth original siguen en su entrada anterior.

Se implementaron las 24 superficies: home/catálogo/PDP/carrito/checkout/resultados, login/registro/perfil/direcciones/favoritos/pedidos, dashboard/contenido/catálogo/ofertas/promos/pedidos/inventario/ML/módulos/configuración. Compra afecta stock, pedido y timeline; el fulfillment es visible al comprador. Oferta modifica vitrina y carrito. Venta ML es deduplicada por operation id; sync, cuenta y alertas de precios están marcados como simulados. Cancelación de formularios no guarda; operaciones destructivas/fulfillment/import usan confirmación modal. Dinero usa unidades menores; identidad y almacenamiento demo usan namespaces separados.

### Evidencia ejecutada

- `npm run test`: PASS 298/298, 73 archivos (13 nuevas pruebas de dominio/snapshot/transacciones), Vitest 4.1.11; 2026-10-08 23:14 ART.
- `npm run lint -- --quiet`: PASS. `npm run check:architecture`: PASS (6 verificadores y escaneo).
- `npm run build -- --configuration production --preserve-symlinks`: PASS, 552.34 kB; 23:17 ART. El primer intento falló por red restringida al descargar Google Fonts; se repitió con permiso de red, sin cambiar fuentes/configuración de producción.
- `npm run test:demo`: PASS con exit 0, 8/8, Chromium, 15.0 s; 23:20 ART. Incluye build demo PASS 1.87 MB; servidor de archivos local se detiene en `finally`.
- Playwright: compra/stock/pedido/despacho/entrega; 24 rutas; contenido/vitrina; ML deduplicado/ajuste; oferta/vitrina/carrito; Escape/foco; reset; buyer observa fulfillment; alerta/historial competidor. Requests de API/externos bloqueados.
- Desktop/mobile: 1440×900, 768×1024, 390×844: PASS sin scroll global; axe 0 violaciones en storefront para los tres tamaños. Se corrigieron contraste de secundarios y landmark del banner. Screenshots storefront/dashboard en `frontend/test-results/commercial-demo-responsive-design-{width}/`. Revisión visual propia realizada; review de diseño independiente: pendiente.
- `runtime-route-cta-inventory.json` es el inventario DOM de rutas y CTA visibles en estado inicial autenticado. Los diálogos/escenarios posteriores se cubren en pruebas específicas; aún falta reconciliación exhaustiva de todos los estados/CTA a assertions individuales.

### Límites y pendientes de cierre

El primer corte no declaraba 100% de CTA accionados ni E01–E10 cerrados. Sus residuales de galería/variantes, bloques y configuración avanzada fueron implementados en el segundo corte descrito debajo. E10 (reviews independientes) continúa pendiente.

HTTP Mock/UA E09 específico: NOT_RUN en este corte; sí full unit y build productivo. Backend FE04, proveedores reales, scraping/ML live, cobros, correo y fiscal: NOT_RUN/fuera de demo. No push, PR, merge ni deploy. No se declara homologación.

## Segundo corte: funcionalidad y matriz exhaustiva de CTA

Sobre `ba80ce0e2b0da865a7cbb068c9b28bca7a6403dd` se amplió la cobertura a cada CTA estático y cada CTA renderizado durante los escenarios. `cta-matrix.spec.ts` observa controles, registra click/change, reconcilia el código y falla si encuentra CTA sin escenario ejecutado; no se excluyen los controles nuevos para conseguir PASS.

Galería frontal/detalle conserva selección y cambia la ilustración. Las presentaciones Estándar/Con estuche cambian precio, persisten en carrito y pedido y comparten explícitamente el stock del SKU físico; no afirman balances independientes de accesorios. La selección desconocida impide comprar. Los bloques de portada se editan y reordenan en borrador; guardar aplica el orden al storefront y cancelar descarta. Los módulos tienen identificador cerrado y editor propio: destacados/umbral stock, días entrega, prefijo tracking y filas ML. Guardar configura vistas/comportamiento; pausar requiere confirmación y bloquea las nuevas operaciones de su dominio. No activa servicios reales.

Hallazgos corregidos durante la matriz: nombres accesibles de selects, reingreso del customer recién registrado, recuperar carrito de pago rechazado, import/archivo/direcciones/fulfillment con confirmación, variant/presentación persistida, precios con centavos visibles, productos archivados fuera de home/no comprables, snapshot con relaciones/configuración inválidas recuperable por reset, y runner de Playwright que finaliza y detiene su servidor Windows.

Evidencia actual: full unit 300/300 (73 archivos); pruebas dirigidas demo 15/15; lint incluyendo demo-e2e/config PASS; arquitectura PASS; build demo 1.90 MB PASS. Playwright 14 escenarios cubren storefront, 24 rutas, todos los controles CRUD/cancel/confirm, filtros/paginación/favoritos, cinco resultados de checkout, fulfillment/RMA, actor isolation, ML sync/error/retry/venta/idempotencia, alertas, export, galerías/variantes, bloques/configuración y 390/768/1440 con axe 0. La matriz registra 285 CTA observados y 285 ejecutados, 100 CTA estáticos reconciliados y cero faltantes. Ver `executed-cta-matrix.json` y `frontend/demo-playwright-report/results.json` (artefacto local regenerable).

Los controles deshabilitados de paginación y reordenamiento tienen límites/razones visibles; sus acciones se ejecutan al pasar a una posición válida. Los SKU agotados conservan recuperación por catálogo/alternativas y se prueban sin comprar stock inexistente. Las variantes opcionales toman el mismo balance del producto y precio adicional de presentación: configuración demo, no inventario productivo de accesorios.

No se afirma homologación ni implementación backend. E10 review funcional/diseño/código/seguridad independiente sobre SHA final: pendiente del coordinador. HTTP/UA Mock específico permanece NOT_RUN en este corte, con suite unitaria productiva y build productivo preservados.

## Corrección de review independiente — cinco P2

Se separaron creación/edición de producto: alta duplicada y renombre de SKU se rechazan; edición conserva la reserva vigente del dominio y rechaza stock inferior. Checkout rechaza productos archivados ya presentes en carrito, sin modificar stock/pedidos, y permite revisar/quitar desde el enlace existente. Reset persiste una revisión nueva; los comandos comparan el snapshot persistido completo y rechazan desaparición/reemplazo incluso con revisión coincidente. Instrucciones demo quedaron junto al formulario de login y el párrafo sidebar recibió color explícito de contraste alto.

Regresiones: full unit 303/303, 73 archivos; lint PASS; arquitectura PASS; build demo 1.90 MB PASS; Playwright 18/18, incluida matriz 285/285 y cero faltantes. Corrida 2026-10-08 23:54–23:57 ART. Los tres tests responsive adicionales generaron 60 capturas (20 superficies por tamaño) de login, catálogo, PDP, carrito, checkout, perfil, direcciones, registro, pedidos y todas las secciones administrativas en 390/768/1440; todas sin overflow global. Inspección visual propia del set representativo: login/catalog/PDP/cart/perfil 390, checkout/content 768, inventory 1440, con instrucciones visibles, tablas contenidas y formularios legibles. Capturas regenerables en frontend/test-results/review-regressions-responsive-complete-surface-set-{width}/. La review independiente debe revalidar este nuevo SHA; no se declara aprobación por implementar las correcciones.
