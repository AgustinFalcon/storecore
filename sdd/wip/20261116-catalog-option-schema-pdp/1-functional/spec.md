# Especificación funcional — option schema de catálogo

## Resultado de negocio

Cada producto describe qué opciones debe elegir el comprador, en qué orden y
con qué presentación. El PDP construye la selección desde ese contrato y resuelve
una variante real; nunca pregunta si el comercio es ropa, herramientas u otro
perfil. Un producto simple sigue siendo comprable sin obligar a configurar ejes.

## Conceptos cerrados

- Presentación de eje: `Select`, `Swatch`, `Unknown`.
- Estado de schema: `Absent`, `Valid`, `Invalid`, `Unknown`.
- Estado de selección: `Complete`, `Incomplete`, `Unavailable`, `Unknown`.
- Disponibilidad de valor: `Selectable`, `Selected`, `Disabled`, `Unknown`.

Las etiquetas/reglas viven en estos tipos. La vista y los tests no comparan
strings wire ni buscan claves como `color`, `talle`, `size` o `profile`.

## Schema funcional

`Absent` significa que el producto no tiene schema persistido. `Valid` exige una
lista ordenada de 1–4 ejes; cero ejes nunca es un schema válido ni genera una
combinación vacía. Cada eje tiene:

- `code` estable, opaco para UI y único en el producto
- etiqueta visible de 1–80 caracteres
- presentación `Select` o `Swatch`
- lista ordenada de 1–50 valores con `code` estable y etiqueta 1–80
- para `Swatch`, color hexadecimal seguro opcional; sin color se muestra texto,
  nunca CSS arbitrario

Cada variante activa asigna exactamente un valor por eje del schema. Una variante
inactiva nueva puede quedar pendiente sin asignaciones y no participa en
proyección, combinación ni unicidad hasta que ADMIN la complete y active en el
mismo CAS. Atributos no configurables, como marca/material técnico, pueden seguir
en `attributes` para lectura descriptiva, pero no aparecen como controles salvo
que estén en schema.
Las etiquetas de ejes son únicas por producto y las etiquetas de valores son
únicas dentro de cada eje tras trim, colapso de espacios y case-fold Unicode.
Pueden repetirse entre ejes. Dos swatches pueden compartir color, pero siempre
conservan texto visible y nombre accesible inequívoco.

## Experiencia del comprador

### Producto simple

- Schema `Absent` y una variante activa: no muestra selector redundante.
- El PDP usa esa variante para precio, stock, favoritos/intención y compra.
- Caso de aceptación: producto HARDWARE con una variante y atributo descriptivo
  `Marca` es comprable sin saber que pertenece a HARDWARE.

### Producto con opciones

- Ejes se renderizan según `sortOrder` y valores según su orden.
- `Select` usa label/select nativo; `Swatch` usa grupo con nombre y estado
  accesible, botón/radio operable por teclado y texto además del color.
- La selección inicial deriva de la variante exacta del SKU de la ruta; si se
  restaura una intención, deriva de ese SKU y conserva cantidad.
- Cambiar un eje conserva valores compatibles. Si la combinación deja de existir,
  limpia sólo los ejes posteriores incompatibles y queda `Incomplete`.
- Un prefijo con uno o varios candidatos sigue `Incomplete` mientras falte un eje;
  nunca autocompleta ni habilita compra. Un vector íntegro sin coincidencias queda
  `Unavailable`; un SKU resuelto sin stock o sin precio conserva identidad pero
  expone la causa cerrada y bloquea compra; duplicados/corrupción quedan `Unknown`.
- Al quedar `Incomplete`, `Unavailable` o `Unknown`, se suspende la intención
  restaurada y se invalidan confirmación y lecturas pendientes del SKU anterior.
  La suspensión escribe un tombstone durable antes de exponer el estado parcial,
  elimina/rota el token `resume` de sessionStorage y URL y sobrevive a recarga.
  Si storage falla, la continuación de URL queda inválida. Una instancia nueva no
  puede recuperar el SKU anterior; sólo otra selección completa y acción explícita
  crea una intención nueva, validada de nuevo por catálogo/carrito en servidor.
- Valores que no participan en ninguna variante pública compatible se muestran
  deshabilitados con motivo, no se ocultan silenciosamente.
- Compra sólo se habilita cuando la selección resuelve exactamente una variante
  pública, con precio/stock conocidos y cantidad válida.
- Precio, stock, SKU e intención usan la misma selección autoritativa; ningún
  componente mantiene una variante paralela. La galería permanece a nivel
  producto hasta implementar el contrato de media por variante de #7.
- Cambio local de opción conserva cantidad y, si supera el stock de la variante
  resuelta, la deja visible pero bloquea confirmar hasta corregirla. Navegar a
  otro producto/SKU por ruta reinicia a 1, salvo restauración exacta de intención;
  refresh conserva únicamente la intención local exacta revalidada por catálogo y
  carrito en servidor.

### Fallback seguro

- Sólo `Absent` usa el selector genérico existente, y únicamente si todas las
  variantes públicas tienen variantId y SKU únicos/no vacíos.
- Schema wire inválido, desconocido, corrupto o ambiguo se traduce a `Unknown`,
  nunca degrada al selector genérico y bloquea compra con mensaje recuperable.
- Si variantes `Absent` quedan indistinguibles, compra se bloquea; nunca elige la
  primera por accidente.

## Administración

El ADMIN edita ejes, orden, presentación, valores y asignaciones de todas las
variantes desde catálogo. El editor:

- empieza desde schema/revisión autoritativos
- usa códigos estables; cambiar una etiqueta no cambia identidad
- permite reordenar sin modificar códigos
- previsualiza combinaciones y lista variantes faltantes/duplicadas
- guarda schema y asignaciones en un único CAS
- conserva borrador en 409; relee la revisión autoritativa, muestra diferencias y
  permite reaplicar explícitamente. Nunca reintenta automáticamente con una base
  vieja ni sobrescribe trabajo ajeno
- en `Replace`, no permite eliminar eje/valor usado sin reasignar en el mismo
  comando; `Clear` elimina ejes/asignaciones atómicamente y vuelve a `Absent`

OPERATOR puede leer; sólo ADMIN con `CATALOG/MANAGE`, mismo origen y CSRF puede
mutar.

## Búsqueda

El parámetro de búsqueda pública/admin coincide, de forma case-insensitive y
acotada, contra:

- nombre del producto
- SKU de cualquiera de sus variantes autorizadas
- nombre de categoría

Los filtros de brand/category y offers existentes se conservan. Facetas nuevas,
sinónimos, búsqueda por atributos/opciones y motor full-text quedan fuera.

## Límites e invariantes

- máximo 4 ejes, 50 valores por eje y 1.000 variantes existentes por producto
- códigos 1–64 en patrón canónico `[a-z0-9][a-z0-9_-]*`; labels sin controles
- color swatch sólo `#[0-9a-f]{6}` canónico; no URL, gradiente ni CSS raw
- combinación de valores única por producto sólo cuando el schema es `Valid`;
  productos `Absent` no generan vector/huella ni participan de esa unicidad
- variante pública/activa debe tener asignación completa válida; variante inactiva
  pendiente no tiene huella, no participa en unicidad y sólo puede activarse con
  asignación completa en el mismo CAS
- agregar/quitar schema no cambia SKU, precio, stock, carrito ni órdenes
- orden descriptivo `attribute_order` no se interpreta como schema

## Criterios de aceptación

- Producto HARDWARE simple con atributo Marca se compra sin selector redundante.
- Producto CLOTHING de prueba muestra Talle como Select y Color como Swatch según
  schema; no existen literales de perfil/talle/color en la lógica Angular.
- Ruta por SKU reinicia cantidad a 1; una intención exacta restaurada selecciona
  la combinación y cantidad guardadas. Cambio local conserva cantidad, pero si
  excede stock bloquea confirmación sin mutarla silenciosamente.
- Combinaciones imposibles quedan deshabilitadas/incompletas y no agregan otra
  variante al carrito.
- Prefijos con uno o varios candidatos nunca autocompletan. Un escenario no
  cartesiano de tres ejes conserva el tercer valor compatible, limpia sólo el
  segundo incompatible y no muestra precio/SKU/favorito viejo.
- Suspender una intención elimina el resume durablemente: recarga, respuesta
  tardía o falla de storage no recuperan el SKU previo.
- Schema `Unknown`, código duplicado, eje/valor excedido, combinación duplicada,
  swatch inválido o asignación incompleta fallan cerrados.
- Un CAS stale no altera schema ni atributos de variantes; el borrador se conserva.
- Tras 409, releer y reaplicar usa una nueva revisión sólo por acción explícita.
- Agregar/reactivar variantes bajo schema válido no elude ADMIN ni el CAS.
- OPERATOR/CUSTOMER/visitante, CSRF/origin inválidos y capability denegada no
  mutan schema.
- Búsqueda encuentra por nombre, SKU y categoría sin exponer productos/variantes
  inactivos en la superficie pública.
- Select/swatch tienen nombre accesible, foco visible, navegación teclado, estado
  seleccionado y explicación del disabled que no depende sólo de color.
- Tests responsive 390/768/1440 verifican 0, 1, 2 y 4 ejes, labels largos,
  combinaciones incompletas y ausencia de overflow.

## Fuera de alcance

Media upload (#7), inventario por opción, kits, personalización libre, facetas de
opciones, ML mapping automático, generación de variantes por producto cartesiano
y perfiles `CLOTHING/HARDWARE` en runtime.
