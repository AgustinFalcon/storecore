# Especificación funcional

## Alcance

1. El operador puede iniciar una carga de producto nueva desde `/user/catalog`.
2. Puede definir el SKU principal, presentación, atributos, estado, precio e
   inventario inicial de cada variante nueva.
3. Puede agregar variantes nuevas a un producto existente con inventario inicial.
4. La identidad y el SKU de variantes ya persistidas son inmutables en este flujo.
5. El stock de una variante existente sólo cambia desde el ajuste de inventario,
   nunca desde la edición de catálogo.
6. Todos los errores dejan el formulario visible y no simulan persistencia.

## Fuera de alcance

- Recuperación de credenciales sin contrato de correo y seguridad.
- Mercado Pago, ARCA, Correo Argentino y sincronización viva de Mercado Libre.
- Activación StoreCore↔BlackStore antes de `release/1.0` y sus homologaciones.

## Criterios de aceptación

- Una creación válida llega al backend con stock inicial sólo para variantes nuevas.
- Una edición nunca envía stock de variantes persistidas.
- Los estados de producto, variante y modo del editor son tipos cerrados.
- No existe fallback silencioso a datos demo en rutas productivas.

