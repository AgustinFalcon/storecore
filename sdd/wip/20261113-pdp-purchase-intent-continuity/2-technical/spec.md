# Spec técnico — continuidad de intención desde la ficha de producto

## Decisión arquitectónica

El corte es frontend-only y usa un puerto de almacenamiento sobre
`sessionStorage`. El dominio no importa Angular, Router, HTTP ni Web Storage. El
challenge dual-realm conserva su propósito de seguridad y no almacena negocio.

No se autoagrega: el endpoint actual es SET absoluto y carece de una operación
durable exactamente-una-vez para ejecutar de forma segura después de navegación,
refresh o reintentos.

## Dominio

### `PurchaseIntentKind`

Clase cerrada TypeScript con constructor privado, instancias estáticas
`AddCartLine`, `None`, `Unknown`, etiqueta y `fromWire` único.

### `PurchaseIntent`

Value object inmutable con fábrica de captura y `fromWire`. Valida versión, flowId,
SKUs, cantidad e instantes. No expone wire crudo a la vista. Versión futura,
campos extra sensibles, tipos erróneos o TTL inválido producen `Unknown`.

### `PurchaseIntentStage` y disponibilidad

Tipos cerrados con constructor privado, instancias estáticas y etiqueta. Las
transiciones inválidas no se representan. La UI renderiza el snapshot tipado.

`CartLineConfirmationResult` es otro tipo cerrado: `Idle`, `Pending`,
`Accepted`, `Rejected`, `OutcomeUnknown`, `Unknown`. Un timeout/error de transporte
que no demuestre rechazo es `OutcomeUnknown`; no se interpreta como seguro para
replay.

## Puertos y adaptadores

- `PurchaseIntentStoragePort`: `save`, `load`, `clear`; devuelve resultados
  cerrados, no excepciones de navegador.
- `SessionPurchaseIntentStorageAdapter`: único borde que serializa, parsea y usa
  `sessionStorage`; una clave versionada por pestaña. Guarda borrador o tombstone
  terminal cuando el navegador lo permite.
- `ClockPort` e `OpaqueIdPort`: permiten TTL e IDs deterministas en pruebas.
- El injector Angular une puertos y adaptadores; el dominio no conoce tokens DI.

## Propietario del recorrido

`PurchaseIntentCoordinator` es una façade `providedIn: root` y única propietaria
del borrador/claim por pestaña. Expone snapshots tipados y comandos; delega cada
responsabilidad en los pasos de dominio. El adaptador de storage es compartido por
la pestaña, mientras que el estado renderizable de PDP sigue siendo feature-local.

La vista solo emite selección, corrección, confirmación y cancelación. El
`ProductPageComponent` conecta el coordinator con `CatalogStore` y `CartStore`.
HTTP permanece en ComponentStore/use-cases/repositories existentes. Ningún objeto
de dominio importa Angular, Router, HTTP, DI ni Web Storage.

## Pasos del flujo

1. `CapturePurchaseIntentStep`: valida la selección exacta y crea el borrador.
2. `PersistPurchaseIntentStep`: guarda o devuelve fallo visible.
3. `AwaitCustomerAuthorityStep`: propaga solo el flowId opaco por login/registro.
4. `ClaimPurchaseIntentStep`: comprueba flowId, TTL y autoridad CUSTOMER; crea una
   generación/actor claim que cerca respuestas tardías.
5. `RefreshPurchaseContextStep`: relee producto y carrito desde los servicios
   existentes, sin mutar.
6. `RestoreExactSelectionStep`: exige SKU exacto; no usa fallback ni reduce qty.
   Una corrección explícita crea una revisión validada, invalida readiness y cerca
   respuestas de la revisión anterior antes de releer elegibilidad.
7. `ConfirmSetCartLineStep`: justo antes del envío valida flowId, revisión, TTL,
   actor, CUSTOMER y generación; explica estado actual→objetivo y, tras click,
   llama una vez al PUT existente. Doble click queda serializado.
8. `ResolveUnknownCartLineOutcomeStep`: ante resultado ambiguo nunca reenvía;
   reconcilia CUSTOMER/CSRF, relee carrito, muestra lo observado y vuelve a
   requerir confirmación si la persona quiere aplicar otro SET.
9. `CompletePurchaseIntentStep`: la respuesta PUT aceptada marca `Completed` de
   inmediato y bloquea nuevos envíos. Refresh y clear/tombstone son efectos
   posteriores independientes; sus fallos se informan sin volver a ready.
   Cancelar, expirar o reemplazar usan cierres explícitos separados. Si el storage
   no permite persistir el tombstone, el cerco en memoria dura la instancia, pero
   no se promete no reaparición durable tras recargar.

Cada paso tiene una sola razón de cambio y el recorrido los ordena. Agregar una
etapa no reescribe las anteriores.

## Integración con acceso

- `ReturnDestination` permanece cerrado y estático. No se agregan SKU ni paths
  dinámicos a `returnTo`.
- La URL puede transportar únicamente `resume=<flowId opaco validado>` entre PDP,
  login, registro y selección de contexto.
- El servidor sigue resolviendo `CATALOG`/homes. El cliente solo navega a
  `/catalog/:productSku` si el storage contiene una intención válida cuyo flowId
  coincide y CUSTOMER fue aceptado.
- Login y registro preservan el resume reference en sus enlaces. Si no hay una
  intención válida, se elimina la referencia y se usa el flujo normal.
- Una política común `ContinueCustomerPurchaseIntentPolicy` se invoca en las tres
  salidas de acceso: rehidratación con sesión ya seleccionada, selección local de
  sesiones existentes y completion de autenticación/challenge. La reconciliación
  de registro invoca la misma política después de aceptar CUSTOMER. Solo ella
  decide si navegar al PDP validado; de lo contrario conserva la ruta
  server-authoritative original.
- USER seleccionado o contexto incompatible ignora el resume y conserva la
  navegación server-authoritative.
- La reconciliación de registro reutiliza la barrera del coordinador y nunca
  repite el POST luego de un alta aceptada.

## Integración con ficha y carrito

- El CTA captura los valores actuales, no el SKU principal ni la primera variante.
- Al volver, se vuelve a pedir producto por productSku y carrito CUSTOMER.
- Solo se marca lista cuando `variantSku` pertenece al producto actual y la qty es
  elegible según datos frescos. No se inventa stock reservado.
- La confirmación usa el caso existente de SET. El resumen muestra la cantidad
  actual y la cantidad final solicitada.
- Al aceptar el PUT se marca terminal y se anuncia. Luego se refresca el carrito y
  se intenta persistir clear/tombstone; un fallo posterior no reabre confirmación.

## Concurrencia y autoridad

- Cada claim captura generación global, revisión CUSTOMER, revisión de selección
  y actor seleccionado. La revisión se relee justo antes del PUT.
- Logout, cambio de actor, nuevo flujo o cancelación incrementan la generación.
- Toda respuesta HTTP relee esas marcas antes de publicar o continuar.
- Dos clicks se serializan; mientras uno está pendiente el CTA se deshabilita. No
  se afirma replay-safe ni exactamente-una-vez: un SET repetido después de otra
  edición podría sobrescribirla.
- Vencimiento/cancelación con PUT en vuelo no cancelan ni transforman el efecto
  servidor; el resultado se resuelve antes de cerrar la representación local.

## Matriz de pruebas

### Dominio y storage

- round-trip conocido; `Unknown` para JSON corrupto, versión futura, clases
  desconocidas, flowId/SKU inválidos, qty 0/negativa/no entera/excesiva, fechas y
  TTL adulterados;
- storage ausente, excepción/quota, reemplazo, limpieza y vencimiento;
- ningún wire contiene precio, stock, customerId, cookie, token ni URL.

### Acceso

- login CUSTOMER directo, dual→CUSTOMER, dual→USER y registro;
- CUSTOMER ya aceptado; USER exclusivo; ambas sesiones;
- login/registro/probe fallidos y reintento sin segundo POST;
- query resume ausente, desconocida, codificada, demasiado larga o no coincidente;
- CART/CHECKOUT continúan usando `ReturnDestination` sin interferencia.

### PDP y mutación

- variante no predeterminada + qty2, cero PUT antes del click;
- producto/variante removidos, variante ajena, precio/oferta/stock cambiados;
- línea inexistente y existente `N→M`;
- doble click, refresh/back antes y después de completar;
- PUT aceptado→GET fallido y PUT aceptado→clear/tombstone fallido;
- timeout ambiguo→relectura→nueva confirmación sin replay automático;
- vencimiento en `ReadyForConfirmation`, edición durante refetch y cancelación con
  PUT en vuelo;
- corrección de cantidad y variante crea revisión nueva y un único PUT final;
- logout/cambio de actor/respuesta tardía no publican ni mutan para otro actor;
- foco inicial, foco tras error y live regions en navegador real.

## Gates

- tests focales del dominio, storage, acceso, PDP y carrito;
- arquitectura Angular, lint, suite completa y build;
- E2E real de acceso unificado y smoke de accesibilidad;
- revisión funcional y técnica/seguridad coordinada antes del PR;
- CI de PR y post-merge verdes.
