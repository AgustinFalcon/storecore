# Evidencia segunda entrega comercial — 2026-10-09

Baseline `0f703e52ed585a1dc1b88627885de826c127b044`; branch `integration/storecore-demo-commerce-processes`. Solo composición frontend demo, fixtures locales y SDD. Backend/productivo no recibió cambios funcionales.

## Buyer

- Catálogo/search/filtros, 12 productos con assets propios, detalle/galería, relacionados excluyendo el actual y archivados, favoritos y presentaciones compatibles.
- Carrito cantidades/quitar/restaurar/persistencia/aislamiento de actor; variantes conservan precio y stock por SKU.
- Checkout tarjeta/QR/transferencia de muestra, procesamiento visible, cancelación previa conservando carrito, aprobado/pendiente/rechazado/error/sin-stock y reintento. Pendiente reserva, cancelar libera una vez; solo aprobado reduce existencias y genera venta/proyección.
- Domicilio/retiro con costo/plazo/destino congelados en pedido. Seguimiento, incidencia visible, alertas de pagos/incidencias y comprobante DEMO descargable/imprimible sin validez fiscal.
- Cuenta con navegación persistente perfil/direcciones/favoritos/pedidos; identidad real y cookies/CSRF no participan.

## Admin

- Crear/editar/archivar/publicar producto y configurar disponibilidad de variante con estuche. Ofertas/vigencias cambian catálogo/checkout; contenido configurable conserva orden.
- Inventario onHand/reserved/available, ajuste con motivo e historial; edición no borra reservas, compra archivada falla sin consumo. Ventas y pedidos derivan de mismos datos.
- Preparar/despachar/entregar, registrar/resolver incidencia y recibir devolución con inspección pendiente, sin restock implícito.
- Alertas de stock/pagos/incidencias/errores ML/precios. Menú administración completo, tablas convertidas a cards y acciones de 44px en mobile.
- ML cinco tabs Cuenta/Publicaciones/Stock/Actividad/Competencia; vínculos, venta deduplicada, proyección automática de stock físico tras venta aprobada/ajuste, cola con desired/observed/confirmed y reintento. Pendientes/rechazos/cancelaciones no registran venta ni proyección automática de stock.
- Watchlist agregar/umbral/pausar/eliminar, historial, cambios de precio y lectura de alerta. Todo dato/proveedor de muestra, sin scraping ni conexión externa.

## Coherencia cross-role

Una compra actualiza stock/admin/pedido; una oferta admin actualiza catálogo/carrito; cambios de envío e incidencias admin aparecen al buyer. Otro actor no accede a pedidos/carrito privados. Request/payment/event dedupe impide consumo duplicado; conflictos de otra pestaña rechazan escritura.

## Validación local

- `npm run test`: 74 archivos / 309 tests PASS, incluye 24 unitarias demo y traducción de tipos nuevos, snapshots entrega, cancelación idempotente, colas/errores de sync y umbral competencia.
- `npm run check:architecture`: 6 tests y scan PASS.
- `npm run lint`: PASS.
- `npm run build:demo`: PASS, entrada demo con assets internos.
- `npm run build -- --configuration production --preserve-symlinks`: PASS, 552.34 kB. Primer intento sin red falló al inlinear Inter; repetido con permiso red y exitoso. El build productivo conserva tamaño y composición base.
- `node demo-e2e/run.mjs`: **20/20 PASS**, Chromium, 24 rutas, 0 skipped/0 flaky/0 unexpected, 143.35s. Proceso completo con bloqueo de API/red externa, escenarios de pago/envío/ML/competencia, teclado de tabs y Escape/focus, responsive 390/768/1440; axe de storefront/dashboard PASS. [Matriz CTA ejecutada](executed-commerce-cta-matrix.json): 332 CTAs ejecutadas, 332 observadas, 122 estáticas, **0 sin ejecutar**. La primera ronda detectó umbral de alerta no alcanzado y tab Cuenta fuera de contexto en prueba; corregidos y reejecutados. El chequeo de asset ahora exige imagen cargada, sin asumir intrinsic width de SVG.

Recursos: `subst T:` retirado después de cada build/test. El runner browser inicia/termina únicamente su servidor demo `4390`. Ningún recurso de backend/DB/provider real iniciado. Reviews UX/producto/código independientes siguen requeridas sobre SHA final; ninguna evidencia demo homologa ML, cobros o carriers reales.

## Corrección de review UX P2

El carrito prometía entrega sin cargo y etiquetaba el subtotal de productos como total, mientras checkout ofrecía domicilio con $3.500 de envío. Se corrigió a **Subtotal de productos** y **Entrega: a calcular en checkout**. El checkout conserva importe completo con modalidad/costo y el comprobante reproduce el snapshot. Navegación de cuenta ahora marca visualmente y con `aria-current=page` el tab activo, incluyendo detalle dentro de Pedidos.

Validación dirigida después de la corrección: build demo PASS, lint PASS y **2/2 Playwright PASS** (`cart delivery quote home/pickup agrees with checkout and receipt`). Domicilio 390px: carrito subtotal $11.250 → checkout/comprobante total $14.750, costo $3.500; retiro 1440px: subtotal/total $11.250, costo $0. Screenshots nuevos bajo `frontend/test-results/commercial-demo-cart-deliv*/`: `cart-subtotal-390.png`, `checkout-home-390.png`, `cart-subtotal-1440.png`, `checkout-pickup-1440.png`. No se cambiaron IDs de CTA ni lógica monetaria/dominio; matriz previa 332/332 permanece como evidencia de la suite completa anterior, no se atribuye un nuevo run completo a este delta.
