# Spec técnico — continuidad de carrito y checkout

## Dominio

Extender `ReturnDestination` en ambos lenguajes con `Cart` y `Checkout`, ligados a
`AccessContext.Customer`. `fromWire` y `fromPath` continúan siendo los únicos
traductores. `routeFor` resuelve rutas fijas y devuelve `null` para contexto no
permitido.

No se introduce un string de retorno paralelo. DTO, store, guards, vistas y tests
hablan con `ReturnDestination`.

## Backend

- Agregar `CART` y `CHECKOUT` al enum, `fromWire` y `fromReturnPath`.
- Mantener `permittedFor`: un resultado USER degrada a `HOME`.
- Crear una migración posterior a la última existente que reemplace únicamente el
  `CHECK` de `unified_access_challenges.return_destination` para incluir los wires.
- No modificar la semántica de nonce, origen, TTL, consumo único ni cookies.
- Actualizar pruebas unitarias, integración HTTP y persistencia del challenge.

## Frontend

- Agregar destinos al tipo cerrado y matrices `KNOWN`/`PATHS`.
- Hacer que CTA de carrito/checkout y guards propaguen `returnTo` tipado.
- Propagar `returnTo` entre login y registro mediante `queryParams` con `.wire`.
- `CustomerRegisterComponent` traduce el query una vez y configura el store.
- Al inicializar, un paso de inspección usa `navigationState` y selección CUSTOMER;
  solo una autoridad ya aceptada puede llevar la etapa a completado.
- Una inspección indisponible entra en etapa cerrada de reintento; no degrada a
  captura porque podría existir una cookie cuya autoridad aún no se comprobó.
- El store conserva un `ReturnDestination`, nunca un path; tras alta exitosa navega
  a `destination.routeFor(Customer)` con fallback a perfil.
- Después de la respuesta de alta, el flujo llama una operación explícita del
  `AccessCoordinator`: invalida probes/decisiones anteriores, ejecuta una prueba
  autoritativa de ambos realms con la cookie y CSRF instalados por el interceptor,
  verifica que CUSTOMER esté autenticado y lo selecciona aunque el hint/contexto
  previo fuera USER. Solo ese resultado habilita la navegación.
- Si el probe falla o CUSTOMER no queda permitido, el destino permanece disponible
  para reintento y la pantalla informa el fallo; no se navega con el
  `markAuthenticated` local ni se altera una sesión USER válida.
- El store distingue con un tipo cerrado captura, alta pendiente, reconciliación
  pendiente y completado. Reintentar después de una respuesta de alta aceptada
  repite solamente la reconciliación; nunca vuelve a enviar el POST de alta.

## Objetos de paso

1. `CaptureReturnDestinationStep`: traduce el borde del router.
2. `InspectRegisteredCustomerStep`: reconoce y selecciona una sesión CUSTOMER ya
   aceptada sin confiar en el boolean local.
3. `ReconcileRegisteredCustomerStep`: fuerza probe autoritativo y selección
   CUSTOMER después del alta.
4. `CompleteCustomerRegistrationStep`: resuelve el destino permitido solo después
   de la reconciliación aceptada.

Cada paso tiene una razón de cambio. La vista solo emite valores de formulario y
renderiza enlaces tipados.

## Matriz de pruebas

- `fromWire/fromPath/routeFor`: conocidos, desconocidos y contexto incompatible.
- URLs externas, scheme-relative, backslash, query, fragment, encoding y longitud.
- Guard anónimo para `/cart` y `/checkout`.
- Login CUSTOMER directo y challenge dual; USER no recibe destino CUSTOMER.
- Registro con CART/CHECKOUT, sin destino y destino adulterado; USER previamente
  activo, ambas sesiones, hint USER, probe/CSRF fallido y reintento sin navegación
  prematura ni segundo POST de registro.
- Entrada a registro con CUSTOMER ya aceptado y con ambas sesiones: sin segundo
  formulario ni sustitución de cookie.
- Enlaces login ↔ registro conservan solo el wire cerrado.
- Migración y constraint aceptan los nuevos wires y rechazan otros.
- Regresión: home, catálogo, perfil y órdenes conservan comportamiento.
