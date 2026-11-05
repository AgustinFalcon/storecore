# SC-SURF-22 R7 — addendum implementable de inventario Demo

Estado: candidato a aprobación técnica/UX. Fecha: 2026-11-04.
Base ejecutable: `8ffc791` (SC20/21 aprobados localmente).

## 1. Precedencia y alcance

Prevalecen este addendum, los snapshots/contratos SC14/17/20/21 y luego los briefs,
manifests y artefactos Stitch. R6 deja de ser autoridad para cifras, variantes,
reservas, Supervisor, cierre de turno, peritaje, hash, `confirm-disable` o auditoría
retroactiva. La implementación es Demo provisional; no amplía backend, Real, ML,
facturación ni condición/publicación de Catálogo.

## 2. Identidad y baseline

La unidad de inventario es el pool por SKU. Las presentaciones históricas o comprables
se muestran como contexto y no reciben saldos propios. No se resetea ni redistribuye
stock persistido.

Baseline derivado actual: 17 SKU; `physical/reserved/notSellable/sellable` total
`253/1/1/249`. DEMO-001 `18/1/0/17`, LUM-042 `12/0/0/12`, VLD-043
`1/0/1/0`, LMP-044 archivado `2/0/0/0`. La única reserva es ORD-1012. Todas las
cifras se calculan desde snapshot; Unknown permanece desconocido y nunca suma cero.

`sellable = active ? physical - reserved - notSellable : 0`, con enteros seguros y
`physical >= reserved + notSellable`. Archivado conserva físico/reserva/historial y
no se clasifica como agotado activo. Outlet es SKU/unidad/lote propio; su condición no
equivale a disponibilidad.

## 3. Consultas y presentación

Feature dedicada `/demo/user/inventory`. Admin y Operator leen/operan; Customer,
sesión ausente y Unknown son denegados antes de datos privados y dentro del comando.

Búsqueda por SKU/nombre y filtros cerrados de salud, publicación y condición. Salud:
Normal, Low (`0 < sellable < settings.lowStockThreshold`), Out (`sellable = 0` para
activo) y Unknown. Publicado/Archivado y Regular/Outlet son ejes independientes.
Métricas globales identificadas y contador `X de Y` filtrado; vacío y cero coincidencias
son estados distintos.

Tabla a 1440, tarjetas hasta 768 y columna única a 390/320. Las cuatro cantidades se
etiquetan completas. Enlaces tipados a historial, Catálogo y pedido correlacionado
conservan búsqueda/filtros/foco. Publicar, archivar, activar y cambiar condición siguen
perteneciendo a Catálogo.

## 4. Comandos

Dos objetos de responsabilidad única:

- `AdjustPhysicalStockStep`: delta físico entero distinto de cero (entrada/salida).
- `ReconcilePhysicalStockStep`: conteo físico absoluto entero no negativo.

Ambos mantienen `reserved` y `notSellable`, validan el mínimo, no corrigen ni truncan
silenciosamente y no llaman `DemoCommerce.adjust`, `queueStock`, backend o ML. La
identidad del SKU es fija. Propuesta: tipo, cantidad, motivo obligatorio y referencia
opcional; review muestra cuatro saldos actuales/propuestos y diferencia física.

Unknown, catálogo incoherente, actor/epoch cambiado, lectura stale, pérdida de writer
o saldo imposible bloquean sin efectos. Estados cerrados:
`Editing | Reviewing | Saving | Applied | AlreadyApplied | Blocked | Conflict | Failed |
Unauthorized | Unknown`.

## 5. Movimiento y persistencia

`DemoMovement` se extiende aditivamente para operaciones nuevas con tipo cerrado,
commandId, payload canónico, actor interno, timestamp, referencia y balances antes/
después. El codec único conserva movimientos heredados de ID/SKU/delta/motivo; sus
campos ausentes se presentan como no disponibles y nunca se reconstruyen.

Mismo commandId/payload ya aplicado devuelve `AlreadyApplied` sin revisión, stock ni
movimiento nuevos. Mismo ID con payload distinto es `Conflict`; otra identidad sobre
una lectura stale requiere actualizar. Propuesta, cambio físico, movimiento y revisión
se persisten atómicamente mediante writer/CAS/readback. Quota/readback conserva el
borrador y snapshot previo; actualizar sólo lee y exige revisión/reconfirmación. No hay
retry automático.

Movimientos SC21 ya aplicados se correlacionan mediante referencia/evento existente;
SC22 sólo los proyecta. Nunca repite disposición ni deduce recepción/stock desde un
reintegro histórico.

## 6. UX, recuperación e historial

Diálogo nativo de edición → revisión → guardado → resultado. Conflicto/fallo conserva
tipo, cantidad, motivo y referencia, muestra estado vigente y recalcula antes de nueva
confirmación. Cancelar/Escape no muta. Editar/actualizar y desaparición de fila por
filtro restauran foco a un encabezado/control estable. Fondo aislado y anuncios se
invalidan al cambiar actor, epoch o SKU.

Historial nuevo muestra tipo, delta/conteo, actor, fecha, referencia y before/after.
Historial legacy muestra sólo evidencia existente y ausencias explícitas. Repetición no
duplica efectos ni borra el resultado aplicado.

Estados: loading, error recuperable, empty, no-results, access denied, Unknown,
conflicto, fallo de persistencia, duplicate y missing SKU.

## 7. Gates

1. Tipos/codec round-trip viejo+nuevo; Unknown; enteros/dinero seguro y cuatro saldos.
2. Ajuste/reconciliación válidos e imposibles; reserva/notSellable/condición/publicación
   sin cambios; cero syncJobs/ML.
3. Idempotencia tras reload, ID conflictivo, dos pestañas, quota/readback, actor/epoch.
4. SC21 Damaged visible `12/0/0/12 → 13/0/1/12` sin replay; históricos honestos.
5. Regresión SC14/17/20/21, CTA y Real SC22 read-only.
6. Verify, lint, arquitectura, builds Real/Demo; browser Admin/Operator, 1440/768/390/
   320, texto 200 %, teclado, trap/Escape/foco, axe y capturas.

SC22 sólo se cierra con dos revisiones Astra independientes sobre fingerprint exacto.
Stitch y el gate visual global permanecen abiertos.
