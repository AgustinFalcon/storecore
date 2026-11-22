# Spec funcional — datos integrales de demostración

## Objetivo

Entregar un escenario local, sintético y repetible que permita presentar StoreCore como una ferretería operativa, con datos suficientes en cada superficie comprador/administrador y sin simular autoridad de proveedores externos.

## Perfil comercial

- Identidad ficticia: **Ferretería Falcon**, dominio y correos `.invalid`.
- 80 productos de herramientas, consumibles, fijaciones, seguridad, medición, electricidad, pintura y jardín.
- Diversidad real de marcas y categorías; las combinaciones no deben quedar perfectamente correlacionadas.
- Galerías de dos a cuatro imágenes, descripciones comerciales, precios y disponibilidad.
- Portada completa: hero, categorías, dos carruseles de productos, dos banners y una sección estacional inactiva.
- Doce ofertas: borrador, activa, pausada y finalizada; porcentaje y monto fijo.
- Comprador principal con tres direcciones, doce favoritos y carrito de cinco líneas.
- Pedidos, pagos, fulfillment y devoluciones sólo se muestran como acreditados cuando existe grafo local coherente de evidencia. Un estado escrito a mano nunca constituye una venta.

## Casos demostrables

1. Explorar inicio, categorías, ofertas y carruseles.
2. Buscar y filtrar catálogo, abrir PDP con galería y disponibilidad.
3. Revisar carrito poblado, elegir entrega y mantener revisión del carrito.
4. Revisar perfil, direcciones, favoritos e historial autorizado.
5. Administrar catálogo, inventario, clientes, ofertas, contenido, capacidades y pedidos.
6. Repetir la carga sin duplicar entidades ni pisar cambios del operador.
7. Mantener Mercado Pago, Mercado Libre, ARCA, Correo Argentino y BlackStore desactivados o explícitamente no disponibles si no hay credenciales/homologación.

## Criterios de aceptación

- El manifiesto define cantidades y miembros esperados; los tests no se limitan a comprobar que una ruta abrió.
- Todas las entidades sintéticas tienen una identidad estable y reconocible.
- La carga se rechaza antes del primer HTTP si el dataset es inválido.
- No se registran secretos, tokens, cookies ni datos personales reales.
- Las pruebas cubren vista comprador y administrador en desktop y móvil.
- El recibo final permite auditar dataset, cantidades, carrito, favoritos, contenido y ofertas.

## Fuera de alcance

- Activar integraciones externas o afirmar observaciones actuales de terceros.
- Homologar pagos, facturación o envíos.
- Convertir datos sintéticos en migraciones productivas.
