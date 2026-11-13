# Spec técnico — continuidad checkout/direcciones

## Diseño

### Dominio

Crear `AddressReturnTarget` en dominio CUSTOMER:

- constructor privado;
- instancias estáticas `Checkout` y `Unknown`;
- único `fromWire` en el borde de ruta;
- `wire`, `label` y destino fijo propiedad del tipo;
- nunca conserva ni renderiza el raw desconocido.

Crear `AddressReadState` cerrado con `Idle`, `Loading`, `Ready`, `Empty`, `Error`
y `Unknown`. `Ready` significa lista no vacía confirmada; `Empty`, lista vacía
confirmada; los demás casos bloquean pago y retorno. El tipo posee labels y
políticas `confirmed`/`usable`; `fromWire` es único y fail-closed.

Convertir `CartFailureKind` de enum a tipo cerrado TypeScript al tocar este flujo.
Mantiene `None`, `Load` y `CurrencyUnavailable`, agrega `Unknown` fail-closed y
centraliza label y política `readFailure`. Su único `fromWire` traduce cualquier
valor fuera del conjunto a `Unknown`; es una protección contractual aunque hoy
el estado se origine localmente. Vista/store/test comparan instancias, no strings.

Crear `CheckoutAttemptState` cerrado con `Idle`, `Pending`, `Retryable`,
`ProductUnavailable`, `Succeeded` y `Unknown`. El tipo posee label y políticas
`inFlight`/`paymentRetry`/`requiresCartCorrection`; `fromWire` falla a `Unknown`.
El error del intento vive en `checkoutErrorMessage`, separado de lectura.

### Estado de checkout

Extender `CartState` con `addressReadState`, `addressErrorMessage`,
`checkoutAttemptState` y `checkoutErrorMessage` independientes. El canal existente
`loading/errorMessage/failureKind=Load` sigue perteneciendo al carrito/mutación.
`loadAddresses` sólo puede modificar su estado, error, lista y selección.
`cartLoadedState` no puede escribir direcciones ni el ciclo del intento de pago.

`canPay$`, `canPay`, `canRetryCheckout` y `submitCheckout` exigen
`addressReadState === Ready` y pertenencia del ID seleccionado. Una lista cacheada
con otro estado falla cerrado.

La vista renderiza estado de carrito y estado de direcciones en canales separados,
de modo que loading de uno no oculte error/retry del otro. El intento de pago es
un tercer canal y su loading deriva de `CheckoutAttemptState.Pending`, no de
`loading`. `FeatureStatus.retry` emite `readRetry`;
el botón “Reintentar el mismo pago” emite `paymentRetry`. El componente mapea
siempre `readRetry → reload()` y `paymentRetry → submitCheckout()`.

`load()` y `cartLoadedState()` jamás escriben `checkoutAttemptState` ni
`checkoutErrorMessage`. `submitCheckout()` es su única autoridad normal: marca
`Pending`, y su propia respuesta publica `Succeeded`, `Retryable` o
`ProductUnavailable`. `UnsupportedCurrency` puede además revocar moneda y dejar
el intento en `Idle`. El retry `Retryable` conserva la idempotency key y no exige
líneas tras una relectura potencialmente vacía; sí exige actor, dirección vigente
y moneda autorizada. Una respuesta GET tardía no puede terminar su `Pending`.

`loadAddresses` usa generación propia. Guardar/eliminar incrementan la generación
antes de mutar, invalidan lecturas viejas y marcan el estado no usable; sólo el
refetch posterior vigente publica `Ready`/`Empty`.

### Intención de compra y apertura de intento

`CartStore` es singleton: un intento terminal o corregible no puede bloquear
compras futuras. Una respuesta exitosa de `add` (alta, actualización o eliminación)
abre un intento `Idle` cuando el estado vigente no es `Pending`, limpia
`checkoutErrorMessage`/receipt y genera una idempotency key nueva. Una mutación
fallida conserva el intento y la clave. El inicio de `add` se bloquea en `Pending`.
`setAddressId` ignora cualquier cambio durante `Pending`; para un ID confirmado,
perteneciente a la lista vigente y distinto del seleccionado, abre un intento nuevo
desde `Retryable`, `ProductUnavailable` o `Succeeded`. La vista deshabilita el
selector durante `Pending`. `load`, `loadAddresses` y `cartLoadedState` no abren
intentos ni rotan la clave: reintentar lecturas conserva la intención original.

### Navegación de retorno

Checkout usa `RouterLink` y query param fijo desde `AddressReturnTarget.Checkout`.
`CustomerAddressesComponent` observa `ActivatedRoute.queryParamMap` y traduce cada
emisión con `fromWire`. También observa `CustomerSession.actorChanges$`: un actor
nuevo fuerza `Unknown`, y el query previo no se aplica de nuevo sin una nueva
emisión de ruta. La vista importa `RouterLink` y sólo muestra el regreso si el
tipo es `Checkout`, el estado es `Ready` y no hay mutación pendiente.

`CustomerStore` conserva una generación/fence de direcciones ligada al actor y un
cancelador propio. En A→B resetea sincrónicamente lista, borrador, estado y error;
list/save/delete usan `takeUntil` y verifican generación antes de publicar.

## Archivos previstos

- `domain/customer/address-return-target.ts` y spec.
- `domain/customer/address-read-state.ts` y spec.
- `domain/cart/checkout-attempt-state.ts` y spec.
- `domain/cart/cart-failure-kind.ts` y spec.
- `features/cart/cart.store.ts` y spec.
- `features/cart/checkout-page.component.ts` y spec.
- `features/cart/checkout-page.view.{ts,html,spec.ts}`.
- `features/identity/customer.store.ts` y tests.
- `features/identity/customer-addresses.component.ts` y spec.
- `features/identity/customer-addresses.view.{ts,html}` y nuevo spec.

## Gates

- Tests focales de dominio/store/vistas/componentes.
- Browser test del recorrido primer cliente: vacío → alta → retorno → dirección
  válida; además axe/teclado del nuevo CTA.
- `npm run verify` completo.
- Doble review GPT-6.1 Sol: dominio/concurrencia y UX/seguridad.
- CI alojado: backend, frontend y E2E real.
