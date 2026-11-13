# Evidencia de implementación

## Baseline observada

- `OfficialOrderApiAdapter.toResource`: `currency.asText("ARS")`.
- `OfficialOrderApiAdapter.toCandidate`: `currency.asText("ARS")`.
- El worker y la política comparan esos valores como strings.
- El adapter oficial permanece condicionado por propiedad y desactivado por
  defecto.

## Gate de implementación

Dos revisiones GPT-6.1 Sol contrastadas emitieron `CONDITIONAL_GO` para este
correctivo offline, sin P0–P3 residuales. El dictamen está registrado en
`sdd/reviews/20261113-sol-mp-currency-offline-go.md`.

## Estado

Implementación y validación local completas; CI del PR y post-merge pendientes.
Configuración, red, credenciales, DDL y base de datos permanecen intactos.

## Implementación

- `PaymentCurrency` cierra `ARS/UNKNOWN`, traduce wire una vez y concentra la
  compatibilidad verificada.
- `OfficialOrderWireMapper` sirve GET y search y rechaza coerciones no textuales.
- Recovery y worker usan la matriz tipada; `UNKNOWN` se rechaza antes de
  clasificación, pago, pedido, inventario o evidencia comercial.
- Acreditación y terminación impaga persisten `currency.name` sólo tras validar.

## Evidencia local

- Suite focal inicial: 42 tests, 0 fallos; detectó y permitió corregir un error
  de compilación exclusivo del test mapper.
- `mvn -B clean test`: 405 tests, 0 fallos, 0 errores, 0 omitidos,
  `BUILD SUCCESS` en 05:55 bajo Java 21.
- Tras agregar la aserción explícita `QUARANTINED`,
  `MpOrdersCheckoutIntegrationTest`: 28 tests, 0 fallos, `BUILD SUCCESS`.
- Revisión de dominio/pagos GPT-6.1 Sol: `APPROVED`, sin P0–P3.
- Revisión de seguridad GPT-6.1 Sol: `APPROVED`, sin P0–P3.
- `git diff --check` limpio; no queda fallback `currency.asText("ARS")` en el
  borde Orders.

## Pendiente

- CI completo del PR.
- Merge protegido por SHA y CI post-merge sobre `master`.
