VERDICT: APPROVED

# Frontend standards — PR #65

**Skill:** Angular Clean Architecture + NgRx (`my-frontend-standards`)
**Criterio que manda:** `sdd/PATTERNS.md` y `AGENTS.md` de este repo. El checklist genérico pide NgRx global y modelos como `interface`. Este proyecto fija Container → view → ComponentStore → use case → HTTP, y los estados cerrados como clase con constructor privado, instancias estáticas y `fromWire`. Esas dos reglas ganan sobre el checklist genérico.

**PR:** https://github.com/AgustinFalcon/storecore/pull/65
**Base:** `integration/storefront-mock`
**SHA:** `c3bfd78`

## Qué se validó

La simulación de envío. `ShippingSimStatus` y `ShippingChoice` son el conjunto cerrado. `MilestonePaint` pinta el paso. El HTTP manda `optionId.code` y `status.code`. Un código que no está en el conjunto queda en `Unknown` y no entra al recorrido de estándar ni de retiro.

## Checklist contra el patrón del repo

- La view de checkout no inyecta store, HTTP ni use case. Compara `ShippingChoice.Pickup`, `Standard` y `Express`. `data-state` usa `step.state.code`.
- El store de checkout y el de `/envio` siguen en ComponentStore. El efecto de avance no escribe la orden.
- El repositorio HTTP no guarda estado. Traduce en el borde con `fromWire`.
- El dominio de envío no importa Angular.
- Tests de recorrido, precio y cobertura: el caso desconocido no avanza.

## Excepciones al checklist genérico (no son gaps)

- No hay `createAction`, reducer ni `StoreModule.forFeature`. `sdd/PATTERNS.md` usa ComponentStore.
- `ShippingSimStatus` es clase, no `interface`. `AGENTS.md` lo exige para un estado cerrado.
- El nombre del archivo no es `shipping.actions.ts`. El feature ya vivía en `domain/shipping` y `features/cart` / `features/orders`.

## Residual

Un cuerpo sin `status` sigue arrancando en `Confirmed`, que es el inicio documentado de la simulación. Un texto desconocido no se convierte en `Confirmed`.

Architecture: ok
State Management: ok
Error Handling: ok
Effects: ok
Naming: ok
