# SC-SURF-26 R7 — addendum acumulativo

Estado: corrección requerida sobre `9b5b52c`. Complementa R6.1 y reconcilia SC21,
snapshot v10 y los gates actuales; no amplía operaciones de cliente ni backend.

## Resultado incierto de cuenta

La restricción/reactivación deja de usar un booleano que trate toda excepción como
fallo conocido. El comando devuelve un tipo cerrado `Saved`, `Failed`, `Conflict`,
`Uncertain`, `Denied` o `Unknown`.

- `Failed`: no se intentó escribir o el rollback fue comprobado; snapshot anterior
  sigue siendo autoridad.
- `Uncertain`: hubo escritura y no puede verificarse readback/rollback. La UI no
  afirma estado anterior ni éxito, pasa a consulta y exige releer/reconciliar.
- Nunca se reenvía automáticamente el comando incierto.
- Actor, sesión, writer, revisión y raw esperado se revalidan antes de escribir.
- Restricción y reactivación comparten el contrato y pruebas de write + readback
  fallido + rollback fallido, incluidas sesiones afectadas.

## Retorno contextual SC26 → SC21

Abrir `ORD-1015` desde Clientes transporta un origen cerrado `Customers`; abrirlo desde
Pedidos usa `Orders`. El detalle resuelve Volver mediante ese tipo, sin query libre ni
URL arbitraria. Refrescar o entrar directamente mantiene el fallback seguro Pedidos.

Esto no revoca el alcance SC21: Admin y Operator pueden realizar las operaciones que
SC21 autoriza. En SC26, Operator sólo consulta la administración de clientes; una vez
en SC21 rigen las reglas propias de SC21.

## Reflow y accesibilidad

El encabezado SC26 permite wrap/stack. A 320 y 390 px con texto al 200 % ningún
documento, encabezado, badge, lista o diálogo excede el viewport. Se verifican también
768/1440, foco, teclado, restauración, axe y continuidad Clientes→Pedido→Clientes.

## Gates

1. Unitarios de resultado cerrado, incertidumbre, rollback/readback, no replay y
   restricción/reactivación.
2. Browser dirigido SC26 sobre snapshot v10, incluido uncertain/reconcile y sesiones.
3. Text200 320/390/768/1440 y axe/foco/dialogs.
4. Regresión SC21 retorno por origen, CTA global, SC24 y SC25.
5. Verify/build Real y Demo; doble review técnica/UX Astra 0 P0-P3.
