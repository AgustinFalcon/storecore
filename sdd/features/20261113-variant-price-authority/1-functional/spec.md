# Spec funcional — autoridad de precio por variante

## Problema

StoreCore permite múltiples SKU por producto, pero hoy todos se cotizan con
`products.base_price`. La demo ya representa presentaciones con importes distintos,
mientras el catálogo productivo, la PDP y el carrito no pueden expresarlo. Resolver
solo la vista permitiría mostrar un precio y cobrar otro.

## Resultado esperado

1. Cada variante declara una política cerrada: heredar precio del producto o usar
   un precio propio. Un valor desconocido nunca se trata como válido.
2. Una variante sin override conserva exactamente el comportamiento actual.
3. Catálogo y PDP reciben la cotización efectiva de cada variante, incluida la
   oferta activa de mayor prioridad.
4. La PDP muestra y confirma el precio de la variante seleccionada; al cambiarla,
   actualiza precio, oferta, stock y CTA como una sola selección coherente.
5. Tarjetas y carruseles consideran todas las variantes públicas activas con
   independencia de su stock momentáneo: muestran un importe exacto si sus
   cotizaciones coinciden, `Desde` si difieren y un estado no cotizable si alguna
   cotización activa es desconocida. La vista no inventa un precio representativo
   ni hace que el precio salte cuando una variante queda sin stock.
6. El carrito cotiza el SKU con la misma política servidor que el catálogo. Nunca
   acepta dinero desde el navegador.
7. Una oferta porcentual o fija sigue siendo de alcance producto y se aplica a la
   base resuelta de cada variante. El descuento fijo conserva la regla vigente de
   tope en la base, evitando importes negativos.
8. Una edición administrativa distingue preservar, volver a heredado y fijar un
   override. Omitir el campo en una variante existente preserva; en una variante
   nueva hereda. Limpiar es una acción explícita.
9. El precio base editable del producto se muestra separado de la cotización del
   SKU abierto. Guardar nombre, medios o atributos nunca copia un override de
   variante sobre la base del producto.
10. Carritos futuros usan el precio vigente al mutar la línea. Pedidos, pagos y
   snapshots ya creados no se recalculan.
11. Un favorito conserva su SKU aunque el producto o la variante se retiren. Sigue
   visible como no disponible y se puede quitar; una cotización ausente no rompe
   ni oculta el resto de la lista.

## Seguridad y consistencia

- Solo el backend resuelve importes y aplica ofertas.
- Override no negativo, escala de dos decimales y moneda ARS de la instalación.
- Los importes fuera de rango o con más de dos decimales se rechazan antes de
  persistir; no se redondean implícitamente.
- Los comandos desconocidos, contradictorios o incompletos fallan cerrados.
- La administración mantiene autenticación, capacidad, CSRF y auditoría vigentes.
- Una variante inactiva no participa del precio público `Desde`.

## Fuera de alcance

- Repricing automático durante checkout o de pedidos históricos.
- Precio por canal, campaña por variante o listas de precios.
- Escritura de precio/stock en Mercado Libre.
- BlackStore/POS y facturación ARCA.
- Redistribución de inventario entre variantes.
- Rediseño de la demo local, que ya posee precios por presentación.

## Criterios de aceptación

- Migración aditiva compatible con datos actuales y constraint de dinero válido.
- Tipo cerrado Kotlin para política persistida y comando administrativo; tipo
  cerrado TypeScript para wire y presentación exacta/desde/desconocida.
- Un único resolver servidor es usado por proyección de catálogo y carrito.
- Dos variantes con precios diferentes se ven distintas en PDP y se cobran con
  esos mismos importes en carrito y orden nueva.
- La tarjeta `Desde` abre el SKU que originó ese mínimo; importe, precio anterior
  y oferta pertenecen siempre a la misma cotización.
- Cambiar manualmente de variante conserva el comportamiento vigente y reinicia
  cantidad a 1. Restaurar una intención exacta repone su cantidad después de
  seleccionar variante y vuelve a validar stock.
- Herencia, override, limpieza y preservación tienen pruebas de contrato.
- Ofertas porcentuales/fijas, prioridad y vencimiento se prueban con ambas bases.
- Gates completos backend/frontend y E2E real verdes.
