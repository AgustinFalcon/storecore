# Especificación técnica — moneda oficial fail-closed

## Tipo cerrado

Crear `PaymentCurrency` en dominio con `ARS` y `UNKNOWN`. Su companion expone
el único `fromWire(raw: String?)`; todo valor distinto de `ARS` resulta
`UNKNOWN`. El tipo también concentra la regla `matchesVerified`: sólo
`ARS/ARS` es compatible. El tipo no importa Jackson, Spring, JDBC ni HTTP.

## Traductor del borde oficial

Extraer la proyección JSON de Orders a un mapper con una sola responsabilidad.
El mapper sólo entrega texto cuando el nodo es realmente textual y delega en
`PaymentCurrency.fromWire`; campo ausente, `null`, números, booleanos, objetos y
arrays llegan como `null` al dominio. GET y search reutilizan ese mismo camino.

`OfficialOrderResource`, `RemoteOrderCandidate` y `ExpectedOrderIdentity`
transportan `PaymentCurrency`. La lectura JDBC del intento traduce una sola vez
con `fromWire`. Las políticas comparan el tipo por igualdad, nunca textos con
`equals(ignoreCase=true)`. La igualdad no basta: ambos lados deben ser `ARS`;
`UNKNOWN` contra `UNKNOWN` siempre produce mismatch y recovery/cuarentena.
La matriz obligatoria es: `ARS/ARS` puede continuar; `ARS/UNKNOWN`,
`UNKNOWN/ARS` y `UNKNOWN/UNKNOWN` se rechazan. Aplica tanto a search como a la
comparación entre GET oficial e intento JDBC del worker.

## Persistencia y efectos

Las dos escrituras de evidencia confirmada —acreditación y terminación impaga—
usan `currency.name` sólo después de que la moneda sea `ARS` y coincida con el
intento. `UNKNOWN` se rechaza antes de toda mutación financiera, de pedido o de
stock. No se agrega columna ni migración.

El POST de creación no aporta moneda verificable. Se conserva el binding
provisional de `providerOrderId` ya existente, pero el worker debe ejecutar GET
y validar `PaymentCurrency.ARS` antes de acreditar. Este WIP no convierte el
POST en evidencia financiera ni amplía MP-LIVE-05.

## Pruebas

- Unitarias de `PaymentCurrency.fromWire`.
- Unitarias de `matchesVerified` con la matriz completa `ARS/ARS`,
  `ARS/UNKNOWN`, `UNKNOWN/ARS` y `UNKNOWN/UNKNOWN`.
- Unitarias del mapper con las formas JSON inválidas y ARS válida.
- Política de búsqueda: candidato o expected `UNKNOWN`, incluso ambos, produce
  `CANDIDATE_MISMATCH`.
- Integración PostgreSQL del worker: remoto `UNKNOWN` contra intento local ARS
  queda en cuarentena y conserva pago, pedido, stock y reserva. El constraint V4
  sólo permite ARS local, por lo que las combinaciones con intento local
  `UNKNOWN` se prueban en la regla pura y la policy, sin debilitar DDL ni usar
  fixtures físicamente imposibles.
- Regresión del caso ARS acreditado.

## Seguridad y operación

No se registran payloads remotos ni secretos. El motivo de cuarentena conserva
el código saneado existente. La propiedad
`storecore.integrations.mp-orders.adapter` sigue sin valor `official` por
defecto y este corte no modifica configuración de despliegue.
