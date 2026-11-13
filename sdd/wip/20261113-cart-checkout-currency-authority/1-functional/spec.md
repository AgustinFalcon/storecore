# Especificación funcional — moneda de carrito y checkout

## Problema

El frontend reemplaza cualquier moneda distinta de `ARS` por `ARS`, ignora la
moneda que devuelve el carrito y formatea con fallback ARS. El backend recibe y
compara strings, y persiste literales ARS en varias capas. Esto puede presentar
o enviar una moneda que no fue confirmada por la autoridad de instalación.

## Comportamiento requerido

- La instalación continúa siendo ARS-only; no se ofrece selector multimoneda.
- Backend obtiene la moneda de la única fila `installation_settings` y la
  traduce a `PaymentCurrency.ARS` o `UNKNOWN`.
- El carrito entrega esa moneda tipada; ausencia o valor no admitido resulta
  `UNKNOWN`, sin inventar ARS.
- Checkout sólo continúa si comando, carrito e instalación son ARS verificados.
- La UI muestra “Pesos argentinos (ARS)” como dato no editable cuando es válido.
- Si el carrito recibe `Unknown`, oculta el formato monetario confiable, muestra
  “Moneda no disponible” y deshabilita pago/reintento.
- Si POST rechaza `UNSUPPORTED_CURRENCY` después de un GET ARS, el frontend
  revoca inmediatamente la moneda local a `Unknown`, conserva la misma clave de
  idempotencia y no ofrece reintentar el pago. La única recuperación es recargar
  carrito/autoridad; sólo un nuevo GET ARS vuelve a habilitar el submit.
- La pantalla nunca imprime el valor wire desconocido.

## Fuera de alcance

- Multimoneda, USD, conversión o selector de moneda.
- Cambiar DDL o el constraint `currency='ARS'` existente.
- Mercado Pago live, credenciales, homologación, fiscal o producción.
- Tipar en este corte monedas de órdenes históricas, promociones o demos.

## Criterios de aceptación

1. Backend reutiliza `PaymentCurrency`; request wire se traduce una vez y el
   servicio no compara ni persiste strings mágicos de moneda.
2. Frontend define un tipo cerrado TypeScript con constructor privado,
   `ARS/Unknown` estáticos y un único `fromWire`.
3. Mapper, entidad, store, repository y vista hablan con el tipo cerrado; el
   store mantiene una sola moneda autoritativa dentro del carrito, no una copia.
4. `Unknown` bloquea checkout y retry, no se normaliza a ARS y no se formatea
   como pesos.
5. Pruebas cubren ARS, wire ausente/desconocido, autoridad de instalación
   ausente, autoridad revocada entre GET/POST, idempotency key preservada y
   payload checkout serializado como `ARS` únicamente.
6. Suites backend/frontend, CI y dos revisiones independientes quedan verdes.

## Rollback

Revertir el commit restaura los strings previos sin migrar datos. El rollback
reabre el fallback inseguro y sólo es admisible con checkout desactivado.
