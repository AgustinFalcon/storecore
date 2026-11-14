# Especificación técnica — autoridad cerrada de moneda

## Backend

- Reutilizar `PaymentCurrency` en `CartView` y `JdbcCartService.checkout`.
- `CartController` es el único traductor del request: `fromWire` antes del
  servicio.
- `JdbcCartService` lee `installation_settings.currency`; fila ausente o valor
  inválido produce `UNKNOWN`.
- Checkout obtiene un snapshot con la autoridad vigente y exige
  `command.matchesVerified(cart.currency)`. Luego usa `currency.name` en hash,
  JSON, orden y pago.
- En replay, traduce también `checkout_snapshot.currency` con `fromWire`; un
  valor `UNKNOWN` se rechaza antes de `withRemoteCheckout` y no crea llamadas MP.
- No se toca esquema: V1 ya impone fila single-tenant y ARS en instalación,
  órdenes y pagos.

## Frontend

Crear `CartCurrency` como clase con constructor privado, instancias estáticas
`Ars` y `Unknown`, `fromWire`, `wire`, `label` y regla `canCheckout`. El dominio
no importa Angular, HTTP ni componentes.

`mapCart` traduce el wire una sola vez. `Cart` y `CheckoutCommand` usan el tipo;
`CartState` no duplica moneda fuera de `cart.currency`. El repository serializa
explícitamente `currency.wire`; nunca envía el objeto. El store toma la moneda
de cada respuesta autoritativa (`load` y `addLine`), no la reemplaza ni expone
un updater de texto. La vista presenta label fijo y sólo usa `Intl` si la moneda
es ARS confirmada.

Agregar `ApiErrorCode.UnsupportedCurrency` y
`CartFailureKind.CurrencyUnavailable`. Ante ese error, el store conserva
`idempotencyKey`, reemplaza `cart.currency` por `Unknown`, bloquea checkout y
muestra una acción de recarga; no reutiliza el efecto `submitCheckout` hasta que
`load` devuelva ARS. La acción de recarga vuelve a leer carrito y direcciones.

## Pruebas

- Backend: `fromWire`, autoridad ARS, ausencia fail-closed, request USD/Unknown
  rechazado y persistencia/replay ARS sin regresión.
- Ausencia/Unknown se rechaza antes de claim, orden, pago, reserva o llamada MP.
- Los tests PostgreSQL que deshabilitan el installation guard deben provisionar
  explícitamente la fila ARS; no se agrega fallback para conservar fixtures.
- Mapper frontend: ARS y desconocidos/ausentes a `Unknown`, sin throw por el
  valor finito desconocido.
- Repository: body checkout contiene `currency: 'ARS'`, no la clase.
- Store: adopta moneda backend, Unknown no paga/reintenta y no se normaliza.
- Store secuencial: GET ARS, POST `UNSUPPORTED_CURRENCY`, moneda `Unknown`, key
  intacta, cero submits adicionales, recarga ARS y submit con la misma key.
- Submit invocado directamente también respeta el guard, independientemente del
  estado disabled del botón.
- Vista: moneda fija, sin input editable; Unknown muestra indisponibilidad y no
  produce formato ARS.

## Seguridad y límites

No se agrega dato sensible, configuración, endpoint, migración ni red externa.
El error `UNSUPPORTED_CURRENCY` se conserva y no expone el wire recibido.
MP-LIVE-05 y las homologaciones continúan NO-GO.
