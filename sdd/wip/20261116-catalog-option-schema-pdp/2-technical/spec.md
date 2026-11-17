# Especificación técnica — option schema de catálogo

## Baseline

`product_variants.attributes` y `attribute_order` ya preservan atributos y orden,
pero no distinguen descripción de opción comprable ni definen select/swatch. PDP
imprime atributos y usa un selector único de variante. Este corte agrega schema
explícito sin reinterpretar datos existentes ni restaurar profiles/tenancy.

La búsqueda actual cubre `products.name` y `product_variants.sku`; se extiende a
`categories.name` conservando autorización, paginación y query count acotado.

## Dominio

Kotlin:

- `OptionPresentation` enum: `SELECT`, `SWATCH`, `UNKNOWN`
- `OptionSchemaState` y `OptionSelectionState` enums cerrados
- `OptionResolutionCause` enum cerrado: `PARTIAL`, `NO_COMBINATION`,
  `OUT_OF_STOCK`, `PRICE_UNAVAILABLE`, `CORRUPT`, `UNKNOWN`
- value objects `OptionCode`, `OptionLabel`, `SwatchColor`, `SchemaRevision`
- `OptionAxis`, `OptionValue`, `ProductOptionSchema`, `VariantOptionAssignment`
- `OptionCombination` canónica ordenada por ejes, usada como clave de unicidad

Angular replica tipos cerrados con constructores privados, instancias estáticas
y un solo `fromWire` en el mapper. Componentes reciben `OptionAxisView` y
`OptionSelection`; nunca leen attributes por nombres mágicos.

Pasos del flujo:

1. `NormalizeOptionSchemaStep`
2. `ValidateVariantAssignmentsStep`
3. `ResolveInitialOptionSelectionStep`
4. `ApplyOptionChoiceStep`
5. `ResolveVariantFromSelectionStep`

Cada paso tiene una responsabilidad. El recorrido ordena los pasos; agregar otra
presentación no reescribe selección, inventario ni carrito.

## Persistencia

Migración propuesta independiente de #7: si #7 ocupa V24, este corte recalcula
el siguiente número al rebase; el nombre lógico es
`catalog_product_option_schema`.

- `products.has_option_schema BOOLEAN NOT NULL DEFAULT FALSE`
- `products.option_schema_revision BIGINT NOT NULL DEFAULT 1 CHECK (BETWEEN 1
  AND 2147483647)`, alineado con `SchemaRevision` y el wire compartido
- `product_option_axes`: product_id, code, label, presentation, sort_order;
  únicos por `(product_id,code)` y `(product_id,sort_order)`
- `product_option_values`: axis_id, code, label, swatch_color nullable,
  sort_order; únicos por eje/código/orden
- `variant_option_values`: variant_id, axis_id, value_id; únicos por variante/eje
- `variant_option_vectors`: variant_id PK, product_id y vector canónico estructurado
  (array/JSON length-prefixed, nunca concatenación ambigua), con
  `UNIQUE(product_id,vector) DEFERRABLE`; sólo contiene variantes activas y
  completas de productos `has_option_schema=TRUE`
- `product_option_validation_guard`: una fila por producto tocado/transacción,
  usada para coalescer y diferir una sola validación integral

Checks cubren longitudes, códigos canónicos, órdenes >=0, hex lowercase y
`SWATCH`/color opcional válido. FKs compuestas prueban que variant/axis/value
pertenecen al mismo producto, incluso para variantes inactivas. Triggers livianos
por fila sólo marcan/coalescen el guard del producto; un constraint trigger
diferible sobre ese guard comprueba una vez al final del comando/transacción
que cada variante activa tenga exactamente todos los ejes, que la combinación
sea única y que `has_option_schema=TRUE` implique 1–4 ejes. `FALSE` implica cero
ejes/asignaciones y ningún vector. Variantes inactivas incompletas no generan
vector. Altas, bajas, reordenamientos e intercambios
se realizan con staging/constraints diferibles para no fallar por estados
intermedios válidos del mismo comando.

La base asegura códigos canónicos ASCII y unicidad estructural. La equivalencia
Unicode de labels (NFKC, colapso de espacios y case-fold completo, incluido
`ß/ẞ`) pertenece al writer de dominio de TASK-003; no se aproxima con
`lower()` de PostgreSQL. Datos que no hayan pasado por ese writer serán tratados
como `UNKNOWN` por la proyección fail-closed de TASK-004.

La migración no infiere ejes desde `attributes`: productos existentes quedan con
schema `Absent` y fallback genérico. `attribute_order` sigue siendo descriptivo.
La migración prueba productos legacy con múltiples variantes, ausencia de
primaria y datos máximos sin producir vectores vacíos ni colisiones.

## Comando administrativo y concurrencia

- `GET /api/v1/user/catalog/products/{sku}/options`: ADMIN/OPERATOR con
  `CATALOG/READ`, no-store; devuelve schema, revisión, variantes y asignaciones.
- `PUT /api/v1/user/catalog/products/{sku}/options`: ADMIN, same-origin, USER
  CSRF, `CATALOG/MANAGE`; payload cerrado:
  `{expectedRevision,operation,axes,assignments,variantOperations}`.

`operation` es `Replace` o `Clear`. `Clear` exige `axes=[]`, assignments vacías y
deja `has_option_schema=FALSE`; se rechaza si una operación de variante intenta
activar bajo ese mismo comando. `variantOperations` contiene objetos cerrados
`Keep`, `AddInactive`, `Activate`, `Deactivate`, identificados por variantId/SKU
opacos y únicos. `Activate` exige su asignación completa en `assignments`; `Keep`
y `Deactivate` preservan identidad/precio/stock. `AddInactive` crea sin vector ni
exposición. Eliminar el último eje sólo se expresa como `Clear`, nunca como un
`Replace` vacío ambiguo.

El parser impone límite de bytes, profundidad, cantidad de ejes/valores/
asignaciones y claves duplicadas antes de materializar objetos o combinaciones.
`ReplaceProductOptionSchema` valida el payload completo en dominio. El repositorio
toma locks siempre producto→variantes, compara revisión y reemplaza ejes, valores
y asignaciones dentro de una transacción. Incrementa revisión una vez, registra
auditoría redacted (códigos/contadores, no labels/colors raw) y rota CSRF con
`IdentityMutationCoordinator`. Cero filas/stale devuelve 409; validación 400;
referencia/ownership opacos 404.

Existe un único protocolo de escritura para pertenencia/actividad/asignaciones:

- todo alta, reactivación, desactivación o cambio de asignación incrementa la
  misma `option_schema_revision` bajo el mismo orden de locks
- con schema `Absent`, `saveProduct` conserva toda conducta legacy autorizada,
  incluida alta activa y cambios de texto, precio y stock; cambiar membresía o
  actividad incrementa la revisión agregada
- con schema `Valid`, `saveProduct` conserva cambios de texto, precio y stock
  según reglas vigentes, pero preserva membresía/actividad; cualquier variante
  nueva queda inactiva, sin asignaciones/exposición, e incrementa la revisión
- sólo el comando ADMIN options puede aplicar `variantOperations` junto con
  asignaciones completas y activar la variante atómicamente
- un 400/404/409 no cambia schema, variantes, auditoría ni CSRF; el cliente relee,
  compara y reaplica explícitamente, sin retry automático

La migración escribe un marcador `catalog_schema_compatibility_version`. Cada
artefacto declara la versión admitida en
`catalog-schema-compatibility-version.txt`. Tras drenar instancias previas, el
despliegue ejecuta `migrate-catalog-schema.sh`: éste rechaza artefactos sin
declaración e invoca un runner Flyway offline del artefacto nuevo, sin Spring ni
listener HTTP, por lo que puede llevar una base limpia/V23 hasta V24. Después,
el wrapper Linux obligatorio `run-with-catalog-schema-interlock.sh` compara el
marcador con la declaración antes de ejecutar la aplicación y falla cerrado ante
marcador ausente, corrupto, inaccesible o incompatible. El wrapper exporta a
Spring exactamente la datasource verificada y rechaza argumentos/opciones JVM
que puedan sustituir datasource, Flyway o configuración. La matriz prueba
artefactos compatible/anterior/corrupto, clean/V23, base inaccesible y bypasses
de configuración. No hay rollback destructivo ni soporte para arrancar
producción con `java -jar` directamente.

## Proyección pública y wire

`CatalogProduct`/DTO agrega:

- `optionSchema: {revision,state,cause,axes[]}`, donde `cause` es el tipo cerrado
  nullable: null para `ABSENT/VALID` y obligatorio para `UNKNOWN`
- cada eje con code/label/presentation/order/values
- cada variante con `optionValues: Record<axisCode,valueCode>`

El mapper backend publica `ABSENT`, `VALID` o `UNKNOWN` con causa cerrada.
Únicamente `ABSENT` habilita fallback genérico. Corrupción, combinación duplicada,
identidad de variante inválida o presentación desconocida produce `UNKNOWN` y
bloquea compra; nunca descarta ejes para aparentar un producto legacy válido.
No publica labels o CSS crudos sin value objects.

`JdbcCatalogProjectionReader` mantiene query count fijo: agrega dos consultas
bulk acotadas (axes/values y assignments) para los products de la página, sin
N+1. Límite excedido falla con código cerrado; no trunca identidad.

El contrato BlackStore conserva su catálogo actual sin option schema en este
corte; el agregado público es backward-compatible y no cambia su autoridad.

## Motor de selección Angular

`OptionSelectionEngine` trabaja exclusivamente con schema y variantes públicas:

- indexa combinaciones una vez por snapshot inmutable
- deriva selección inicial del SKU exacto de ruta o intención
- calcula valores selectable/disabled para el prefijo actual
- al cambiar eje N conserva anteriores, conserva posteriores compatibles y
  limpia sólo posteriores incompatibles
- `Incomplete` cubre cualquier vector parcial, tenga uno o varios candidatos; no
  autocompleta aunque sólo quede una variante
- `Complete` exige vector íntegro y resuelve exactamente un variantId; cero es
  `Unavailable`; más de uno/corrupción es `Unknown`
- stock agotado y precio ausente son causas cerradas distintas de combinación
  inexistente; todas bloquean confirmación sin reciclar precio/SKU anterior
- sólo schema `Absent` usa `GenericVariantSelection`; `Unknown` falla cerrado

`ProductPageViewComponent` mantiene una sola `ProductPurchaseSelection` con
variantId/SKU, option values y cantidad. Cambiar opción suspende la intención e
invalida generaciones/lecturas del SKU anterior, escribe primero un tombstone en
el repositorio de intención y retira/rota `resume` de sessionStorage/URL. Claim
requiere ambos: token de ruta y registro local vigentes. La URL se reemplaza antes
de exponer el estado parcial; si storage falla, compra queda bloqueada y la URL
sin token impide que una recarga reclame el registro antiguo. La
suspensión sobrevive recarga y respuestas tardías. Resolver un SKU exacto sólo
actualiza la selección; una acción explícita posterior crea con `capture` una
intención y flowId nuevos, revalidados por catálogo/carrito, nunca hace `revise`
sobre el tombstone. Ruta a otro producto/SKU
resetea a 1 salvo restauración exacta; refresh sólo restaura intención validada.
Cantidad mayor al nuevo stock se conserva visible pero bloquea submit. Precio,
stock, favorito y submit derivan de esa selección; media sigue a nivel producto.

Componentes:

- `ProductOptionSelectorComponent` orquesta ejes
- `SelectOptionAxisComponent` usa label/select
- `SwatchOptionAxisComponent` usa fieldset/legend y radio/button semántico,
  texto siempre visible además del color, `aria-checked/disabled` y foco roving
- `GenericVariantSelectorComponent` preserva compatibilidad

No existe import, branch ni string de `CLOTHING`, `HARDWARE`, `talle`, `color`
o equivalentes en estos componentes, stores o motor.

## Búsqueda

`GET /api/v1/catalog` y `GET /api/v1/user/catalog` aceptan el mismo query
normalizado; controller→service→reader y los stores/vistas Angular pública/admin
lo transportan explícitamente. La cláusula queda:

`lower(product.name) LIKE ? OR lower(authorized_variant.sku) LIKE ? OR
lower(category.name) LIKE ?`.

El query se normaliza/limita antes de SQL, usa parámetros y escapa comodines con
semántica literal. Items y count reutilizan el mismo predicado `EXISTS`/joins,
incluida categoría nullable, sin alias ausentes. Público aplica producto ACTIVE y
variante ACTIVE; SKU se compara case-insensitive. Admin conserva su visibilidad
actual e incluye SKU inactivo sólo
según su autorización. Índices funcionales/trigram sólo se agregan
con evidencia de plan/volumen; este corte no promete ranking full-text.

## Seguridad y accesibilidad

- labels se renderizan como texto Angular, nunca `innerHTML`
- swatch sólo asigna un token hex validado a una propiedad CSS acotada
- códigos no se usan como selector CSS, HTML id sin encoding ni ruta
- límites de bytes/estructura/duplicados se validan antes de deserializar y de
  construir combinaciones; TypeScript usa `Map.has/get`, nunca propiedades de
  objetos controladas por códigos (`constructor`, `__proto__`)
- cálculo es O(variants × axes × values) dentro de límites; sin producto cartesiano
- auditoría/errores no filtran payload completo ni atributos privados
- role/origin/CSRF/capability se prueban con matriz negativa
- disabled tiene explicación textual asociada; color nunca es el único indicador

## Verificación

- dominio Kotlin/TS: fromWire/Unknown, códigos, labels, swatch, límites, orden,
  combinaciones únicas y schema vacío
- PostgreSQL 16 clean/upgrade: CAS, marcador de compatibilidad, artefacto anterior,
  constraints diferibles, swaps, concurrencia, FK ownership, variante activa/
  inactiva, legacy multivariante y no inferencia desde attributes
- API: roles, origin, CSRF, capability, no-store, 400/404/409 y CSRF rotado
- proyección/query count: Absent y 1/2/4 ejes, 1.000 variantes, 4.000
  asignaciones, límite temprano sin truncado y presupuesto medido
- motor: ruta SKU, intención suspendida, prefijo con uno/varios candidatos,
  combinación imposible/duplicada, stock/precio ausentes, fallback sólo Absent,
  cantidad conservada/bloqueada y valores disabled
- browser real: hardware simple; clothing schema Select+Swatch; teclado; admin
  edita/reordena; 409 conserva borrador; búsqueda nombre/SKU/categoría
- arquitectura: búsqueda automática falla si lógica Angular agrega literales de
  perfiles o claves comerciales prohibidas
- responsive/a11y 390/768/1440 y Axe; dos reviews exact-head, CI y post-merge

## Límites

No implementa media upload, facetas por opción, ML option mapping, generación
cartesiana de variantes, perfiles comerciales ni homologación externa.
