# Demo SC03 / SC20 / SC21B — corte funcional local

Fecha: 2026-10-20. Worktree: `storecore-frontend-product-completion-sdd`.

## Alcance implementado

- SC03 modela `Request`, `Submitting`, `Sent`, `InvalidToken`, `Expired`, `Used`, `Completed`, `ServiceError` y `Unknown` como tipo cerrado. El formulario bloquea doble envío, conserva el email durante la recuperación, anuncia el resultado y mantiene el retorno bajo `DemoReturnDestination`; una URL externa no llega al enlace de ingreso.
- SC20 usa la fixture exacta de doce pedidos `ORD-1007` y `ORD-1012..ORD-1022`. La cola incorpora filtro cerrado de incidencias, conteo de selección y CSV informativo con esquema `id,payment,shipment,total,incident`; ausencia de incidencia se normaliza como `NONE`. La descarga atraviesa `DemoBrowserEffects` y la selección no ejecuta transiciones.
- SC21B separa recepción, inspección, disposición y reembolso. Inspeccionar exige notas y resultado cerrado pero no altera inventario ni dinero. Disponer exige inspección, confirmación y sólo se aplica una vez. `Restock` aumenta físico/vendible; `Damaged` aumenta físico y no-vendible, preservando el disponible. El reembolso exige disposición y deriva el monto de las líneas.
- El detalle expone el eje cerrado `None → PartiallyRefunded → FullyRefunded`, importe reintegrado y saldo pagado. El pago del pedido no se reescribe para representar un reintegro parcial.

## Evidencia ejecutada

- `npm test`: **141/141 archivos; 636/636 tests PASS**.
- `npm run build:demo`: **PASS**, bundle Demo generado.
- Playwright dirigido inicial: `buyer-completion.spec.ts`, `cta-matrix.spec.ts`, `fulfillment-inventory.spec.ts`: **16/16 PASS**.
- Playwright Demo completo sobre el corte final, incluido el fixture y recorrido `ORD-1015`: **60/60 PASS** en 3,2 minutos.
- Build productivo Real: **PASS** (`748.61 kB` raw / `162.03 kB` estimado). No se modificó su contrato.

## Límites honestos

- No se tocó backend, integración externa, homologación, despliegue, commit, push ni PR.
- Este corte no acredita TASK-003/004/015/019/021: faltan Stitch/triple review global, matriz visual completa y certificación sobre SHA estable.
- `tasks.json` conserva esos estados globales abiertos; este archivo registra sólo el avance funcional local.
