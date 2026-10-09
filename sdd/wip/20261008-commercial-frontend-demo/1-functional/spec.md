# Contrato funcional

## Objetivo y criterio de completitud

Un cliente puede recorrer la tienda y una persona operadora puede administrar el mismo comercio con datos coherentes, diseño completo y resultados observables. Cada CTA visible navega a un destino válido, abre un diálogo funcional o realiza una operación verificable. No cuentan como funcionales un toast sin efecto, un enlace `#`, un diálogo vacío, una acción que siempre responde éxito, o un botón deshabilitado sin razón y recuperación.

La cobertura del 100% significa 100% de rutas y acciones del inventario reconciliado contra el DOM y componentes del SHA entregado. No equivale a cobertura del 100% de todo escenario concebible ni a backend implementado. Antes de cerrar se incorporará al inventario cada CTA nuevo, incluyendo paginación, cerrar, cancelar, descargar, reintentar y acciones de menús.

## Requisitos

- DEMO-R01: composición DEMO explícita, banner discreto persistente «Demostración · datos simulados», inicio reproducible, reset confirmado y sin tráfico a APIs reales.
- DEMO-R02: storefront con identidad visual, navegación y búsqueda, categorías, marcas, colecciones, ofertas, tarjetas con fotografía/alternativa, precios, disponibilidad y footer útil; catálogo con búsqueda, filtros combinables, orden y paginación.
- DEMO-R03: PDP con galería, variantes, cantidad válida, stock, precio, descripción/especificaciones, favoritos y relacionados. Agregar al carrito altera contador y permite seguir comprando o revisar.
- DEMO-R04: carrito editable, cantidades/stock, quitar/restaurar, resumen; checkout por pasos con dirección, entrega, revisión y pago simulado explícito; resultado coherente ante aprobado, pendiente o rechazado y recuperación sin duplicar pedido.
- DEMO-R05: login único y selección de contexto conservada; registro, perfil, direcciones CRUD con principal, favoritos persistentes en demo, lista/detalle de pedidos con estados, timeline y seguimiento simulado. Cambio de identidad aísla datos privados.
- DEMO-R06: administración completa: shell responsive, home con métricas derivadas, contenido previsualizable, catálogo/variantes, ofertas/promos, pedidos/fulfillment, inventario, Mercado Libre, capabilities y perfil/configuración importable. Todas las operaciones guardan y reaparecen en lectura.
- DEMO-R07: fixtures conectadas compra → reserva → pago → consumo/liberación → pedido → preparación/envío/entrega. Edición de catálogo/contenido/precio actualiza storefront. Inventario y métricas derivan del mismo estado.
- DEMO-R08: Mercado Libre muestra productos vinculados, stock deseado/observado, sincronización y venta simuladas, errores/reintento; inteligencia comercial muestra historial y alerta de cambio de precio simulada. Nunca afirma conexión, venta o alerta real.
- DEMO-R09: diseño revisado con evidencia desktop/mobile, navegación teclado y estados loading/empty/error/success/forbidden/unknown en contexto. Ningún fallo bloquea todo el shell.
- DEMO-R10: comportamiento HTTP/auth de producción preservado y verificado separadamente; no fallback automático a datos demo si falla red o auth.

## Flujos y reglas observables

Escenario inicial: perfil comercial genérico importable, al menos 12 productos de 3 categorías, variantes disponibles/agotadas/bajo stock, ofertas vigentes/futuras/vencidas, órdenes en cada fase pertinente y dos customers sintéticos con historiales distintos. No credenciales reales en fixtures. Una cuenta demo de administrador y una de cliente se presentan como identidades de demostración, no como seguridad productiva.

Compra aprobada reserva y consume una vez; doble click/reintento mantiene el mismo resultado. Pago pendiente mantiene reserva; rechazo/cancelación libera sin aumentar stock más de una vez. El inventario disponible nunca es negativo. La selección de escenarios permite producir rechazo, falta de stock y error recuperable sin introducir errores al azar durante presentación. Checkout conserva borrador ante fallo; al confirmar usa precios actuales y muestra discrepancia antes de continuar.

Operaciones admin usan formularios completos, validación inline, confirmación cuando corresponda, feedback con entidad afectada y vista actualizada. Cancelar no muta; guardar inválido no cierra ni pierde campos. Listas incluyen filtros, acciones por fila, empty state con salida y detalle. Fulfillment solo muestra acciones permitidas por el modelo simulado; entrega y devolución no hacen compensaciones de stock implícitas sin operación explícita del escenario.

ML simulado permite vincular/desvincular, inspeccionar diferencias, sincronizar y simular una venta con identidad estable; repetirla no descuenta dos veces. Alertas de competidores son fixtures read-only sin scraping ni requests externos. Conectar una cuenta abre el flujo simulado y termina en estado claramente simulado. Fiscal/correo/pago nunca realizan emisión, transporte o cobro externo.

## Diseño y accesibilidad

Reutilizar navy/canvas/accent y tipografía del sistema existente con jerarquía comercial: contenido útil, fotografías consistentes, tarjetas equilibradas, números legibles, formularios agrupados y acciones primarias claras. Administración tiene navegación y densidad propias, sin renderizar DTO, JSON o nombres internos como interfaz principal. Toda imagen tiene alternativa y fallback local.

Evaluar 390×844, 768×1024 y 1440×900; ausencia de scroll horizontal global; tablas se adaptan con columnas prioritarias o desplazamiento contenido identificado; CTA sticky no oculta contenido/foco. Diálogos conservan y restauran foco, Escape/cancelación, etiquetas y errores asociados; estados anunciados mediante región live pertinente. Contraste WCAG AA, objetivos táctiles utilizables y zoom 200%. La validación visual requiere screenshots y revisión humana/agente, no solo axe.
