# Cierre de presentación al cliente — Fase 1

Fecha de corte: 2026-11-06.

## Objetivo y límite

Este addendum cruza el alcance comercial de Fase 1 con las superficies ejecutables de StoreCore. El objetivo es que el cliente pueda recorrer la tienda y la administración completas usando datos Demo persistentes, sin confundir una simulación con una integración externa homologada.

No habilita Mercado Pago real, ARCA, Correo Argentino ni escritura contra Mercado Libre. Esos proveedores conservan sus límites y specs propios.

## Matriz funcional verificada

- Descubrimiento: Home, búsqueda global, categorías, beneficios, bloques editoriales y carrusel de destacados paginado.
- Catálogo: búsqueda, marca, categoría, condición, disponibilidad, precio máximo, orden, paginación y recuperación de URL inválida.
- Producto: galería local, variantes, precio/lista/oferta, condición, garantía, disponibilidad, retiro, cantidad, favoritos, carrito y relacionados.
- Identidad: ingreso único, elección CUSTOMER/USER, registro, recuperación Demo y continuación segura.
- Compra: favoritos, carrito, actualización de cantidades, conflictos, checkout por pasos, dirección, retiro/envío, tarjeta/QR/transferencia simulados, revisión y resultado.
- Cliente: perfil, direcciones CRUD, pedidos, detalle, tracking, incidencia, devolución y reintegro simulado.
- Administración: resumen operativo, contenido, producto/variante/media/condición, ofertas, campañas, clientes, pedidos, detalle, inventario, canal ML simulado, módulos y configuración.
- Producto y variantes: alta, edición, publicación/archivo, precios, stock inicial, media enriquecida, variante estándar/caja y condición outlet.
- Marcas y categorías: el Demo las trata como facetas derivadas del producto; su edición ocurre en el formulario de producto. El frontend productivo conserva los comandos `saveBrand` y `saveCategory`. No se crea una segunda fuente Demo sin identidad o reglas propias.
- Stock: saldos físico/reservado/no vendible/disponible, filtros, ajuste, conciliación, historial y alertas.
- Ventas: cola de pedidos, filtros, selección, exportación informativa, pago/entrega, fulfillment, tracking, incidencias y posventa.
- Estados transversales: loading, vacío, inválido, Unknown, error persistente, permiso denegado, conflicto, responsive, teclado y foco.

## Datos de presentación

- El snapshot reproducible `demoSeed()` provee productos, imágenes locales, variantes, compradores, direcciones, pedidos, ofertas, campañas, movimientos, publicaciones ML simuladas, competidores y casos de posventa.
- Las mutaciones Demo se guardan en el almacenamiento local versionado y pueden restablecerse desde la banda “Demostración”.
- Cada pantalla que representa proveedores o dinero declara explícitamente que no ejecuta una operación real.

## Hueco encontrado y resolución

La Home publicaba “Los favoritos del taller” como grilla estática. El alcance comercial pedía una portada con carrusel. Se incorporó:

- dos productos visibles por página, tomando el límite configurable `homepageItems`;
- controles anterior/siguiente con límites deshabilitados;
- estado anunciado “Selección N de M”;
- etiquetas accesibles, CTA inventariadas y diseño responsive;
- animación sólo espacial, sin alterar opacidad ni contraste durante la transición.

No se detectó otra ruta base faltante frente al manifiesto de 26 superficies. Los pendientes restantes son gates de validación, PR/integración y contratos backend/proveedores, no pantallas faltantes de Fase 1.

## Evidencia requerida para cerrar este corte

- build productivo y build Demo;
- unit/component, lint y arquitectura;
- escenario focal del carrusel con Axe;
- CTA matrix completa, incluyendo ambos controles;
- suite Demo completa y recorrido responsive 390/768/1440.

