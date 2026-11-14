# Spec técnico — autoridad de precio por variante

## Persistencia

Agregar una migración posterior a V20 con
`product_variants.base_price_override NUMERIC(14,2) NULL` y `CHECK` no negativo.
`NULL` significa herencia; no se agrega moneda por variante porque la instalación
continúa limitada a ARS. No se edita V1.

## Dominio backend

Crear una clase sellada `VariantBasePricePolicy`:

- `Inherited(productBase)`;
- `Override(amount)`;
- `Unknown` para wires/filas no representables.

Su factory es el único traductor desde persistencia y entrega el importe resuelto
solo para estados conocidos. La regla de oferta vive después de esta resolución.

Crear además un resultado cerrado `SkuPriceResolution`:
`Known(PriceProjection)` o `Unknown(reason)`. Una oferta con tipo desconocido,
datos contradictorios o dinero no representable produce `Unknown` tanto en
catálogo como en carrito; nunca se degrada a precio base.

Crear un `SkuPriceAuthority` con una responsabilidad: cargar una identidad SKU
existente, resolver base y proyectar la oferta activa determinista sin decidir
vendibilidad. Catálogo, favoritos y carrito dependen de este puerto/política; no
duplican `COALESCE` ni reglas de descuento. Un puerto de venta separado compone
estado de producto/variante con esa resolución para el carrito. Así admin puede
leer inactivas y favoritos retirados siguen removibles.

`CatalogVariant` incorpora `price: SkuPriceResolution` y una proyección cerrada de su
política persistida (`INHERITED` u `OVERRIDE`, con el override cuando corresponda).
`CatalogProduct` incorpora `productBasePrice`, que es el único campo editable como
base padre. `CatalogProduct.price` permanece como cotización del SKU exacto pedido
o del SKU de referencia de esa fila, pero nunca alimenta `productBasePrice` ni el
editor. Así un override igual a la base también conserva su identidad explícita.

## Comando administrativo

Modelar `VariantPriceCommand` como conjunto cerrado:

- `PRESERVE`: solo válido para variante existente; omisión se traduce aquí;
- `INHERIT`: persiste `NULL`;
- `OVERRIDE`: exige `base` válido y persiste el importe;
- `UNKNOWN`: se rechaza.

Para una variante nueva, omisión se traduce a `INHERIT`. `priceCommand: null` se
rechaza; solo ausencia real significa omisión. El borde HTTP acepta un
objeto por variante `priceCommand: { mode, base? }`; `base` con modo distinto de
`OVERRIDE`, o `OVERRIDE` sin base, es contradictorio. La respuesta expone por
separado `pricePolicy`, nunca el comando. El frontend conserva política actual y
comando pendiente como objetos distintos, administra el modo mediante tipos
cerrados y serializa desde un único mapper.

Crear `ArsAmount` como value object de borde. Acepta número JSON o texto decimal
canónico solo si representa exactamente `0..999999999999.99` con escala máxima 2.
Rechaza booleanos, vacío, notación no admitida, `NaN`/infinito, escala adicional y
rango excedido antes de JDBC. La misma validación aplica a `productBasePrice` y al
override. Toda violación produce 4xx de validación y rollback completo.

## Proyección y ofertas

El reader por página conserva cantidad fija de queries. La consulta de variantes
incluye override y los datos de la oferta seleccionada por producto; cada fila se
proyecta mediante la misma política pura usada por el resolver. No se introduce
N+1. Porcentual descuenta sobre la base resuelta; fija conserva
`min(discountValue, resolvedBase)`.

El filtro `offers=true` conserva alcance producto. Una variante activa heredada u
override refleja la misma oferta, calculada contra su propia base.

## Carrito, orden y pago

`JdbcCartService.price(sku)` delega en el puerto de cotización vendible, que exige
producto/variante activos y una resolución `Known`. `Unknown` falla cerrado y no
muta la línea. La entrada continúa siendo solo SKU y cantidad. El snapshot de
carrito guarda original, descuento y efectivo resueltos; checkout copia ese
snapshot y Mercado Pago recibe el total de orden. No se recotizan pedidos previos.

## Frontend

El mapper HTTP traduce `productBasePrice`, política y precio de cada variante en
un único borde. La ausencia de precio o política en una variante produce
`Unknown`; no se convierte silenciosamente en herencia usando el precio padre.
Durante una incompatibilidad de rollout la PDP deshabilita el CTA de esa variante
y los listados muestran no cotizable hasta recibir el contrato completo.
Crear `CatalogPricePresentation` como clase cerrada con `Exact`, `From` y
`Unknown`; recibe todas las variantes activas, independientemente del inventario.
Si alguna activa carece de cotización conocida, el resultado es `Unknown`; cero
variantes activas también es `Unknown`. Si todas tienen la misma firma comercial
(efectivo, original y oferta) es `Exact`; si difieren es `From`. El representante
se elige por menor efectivo y luego SKU ascendente, conservando juntos SKU destino,
efectivo, original y oferta. Inventario agotado, missing o desconocido no cambia
el resumen; la disponibilidad se comunica por separado. Stores, vistas y tests
usan el objeto, nunca comparan wires o textos.

PDP deriva el precio exclusivamente de la variante seleccionada. Catálogo, home y
ofertas agregadas usan la presentación cerrada y navegan al SKU destino de esa
misma cotización. Favoritos identifican un SKU exacto y muestran su cotización
exacta, no un resumen agregado. No existe fallback legacy que invente autoridad.

El editor admin muestra `productBasePrice` en el bloque producto y, por variante,
la política persistida actual. El draft conserva `PRESERVE` al abrir; tocar
Heredar emite `INHERIT` y tocar Precio propio emite `OVERRIDE`. La cotización
`CatalogProduct.price` jamás se copia al campo base del draft.

## Compatibilidad a inventariar

- `JdbcFavoriteRepository` no debe seguir mostrando `products.base_price`: el
  favorito identifica un SKU exacto y reutiliza su resolución autoritativa sin
  exigir vendibilidad. Si está retirado o la resolución es desconocida, conserva
  identidad, marca indisponible, omite importe y permite DELETE idempotente. Un
  registro problemático no invalida la lista completa.
- `JdbcPromoService` y `channel_price_policies` son precios de canal y quedan fuera:
  se documenta explícitamente que no son la autoridad WEB de variante.
- BlackStore conserva el contrato actual hasta su SDD de integración.

## Matriz de pruebas

- Migración desde esquema histórico y esquema limpio; null, cero y negativo.
- HTTP de dinero: entero, dos decimales y máximo válidos; escala adicional, rango,
  null explícito, booleano, texto inválido y tipos incorrectos con 4xx y rollback.
- Dominio: Inherited/Override/Unknown y comandos Preserve/Inherit/Override/Unknown.
- Admin: crear heredada/override; editar preservando; limpiar; contradicciones;
  autenticación, capacidad y CSRF.
- Proyección: dos variantes diferentes y una heredada; override igual a base;
  admin/público; SKU exacto; base padre separada; sin N+1.
- Oferta porcentual/fija, prioridad, vencimiento y tope fijo por variante.
- Oferta de tipo desconocido o contradictoria: `Unknown` idéntico en catálogo y
  carrito, sin fallback a base ni mutación.
- PDP: selección manual reinicia cantidad a 1; restauración tipada repone la
  cantidad exacta solo si sigue permitida; contrato legacy queda no cotizable y
  no habilita compra.
- Catálogo/home/ofertas: Exact/From/Unknown, SKU destino coherente, sin depender de
  stock y excluyendo inactivas. Favoritos: cotización exacta por SKU.
- Editor: abrir un SKU override y guardar solo el nombre no altera base padre ni
  las variantes heredadas.
- Favorito retirado o con precio desconocido permanece visible/removible y no
  rompe favoritos sanos.
- Carrito → orden → fake Mercado Pago: importe del SKU, sin precio cliente.
- Regresión: productos sin override producen los mismos snapshots actuales.
