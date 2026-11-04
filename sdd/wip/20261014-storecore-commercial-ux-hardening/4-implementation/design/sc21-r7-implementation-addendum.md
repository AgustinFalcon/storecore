# SC-SURF-21 R7 — addendum implementable de detalle operativo y posventa

Estado: candidato a aprobación técnica/UX. Fecha: 2026-11-04.
Base ejecutable: `0575b10` (SC20 aprobado localmente).

## 1. Precedencia y límites

Para SC21 prevalecen, en este orden:

1. este addendum;
2. los contratos ejecutables SC14 y SC20 y su ledger persistido;
3. especificación funcional/técnica general;
4. `sc21b-r6.2-brief.md`, manifests y artefactos Stitch como referencia visual.

La implementación es provisional y no cierra TASK-004 ni el gate visual global. No
amplía backend, rutas Real, proveedores, facturación, Mercado Pago, logística externa
ni SC22. La UI no imprime lenguaje técnico de fixtures, memoria o heurísticas.

## 2. Verdad canónica de ORD-1015

No se restaura ni simula el baseline antiguo `2/0/0/$0`. El estado inicial ejecutable
es:

- pedido entregado por $169.000, pago Aprobado;
- `RETURN-1015-1` histórico: una unidad reintegrada por $84.500;
- una unidad disponible y $84.500 de productos todavía sin reintegro;
- el evento histórico sólo acredita el reintegro fechado 2026-10-16. No autoriza a
  inferir recepción, inspección, disposición ni movimiento de stock.

SC21 crea un segundo expediente independiente para la unidad restante. Al finalizarlo,
el reintegro agregado de productos es $169.000, el remanente es $0 y el pago continúa
Aprobado. El refund por expediente y el refund agregado del pedido son proyecciones
distintas. Los importes se derivan de líneas históricas en centavos, nunca del precio
vigente ni de un envío no desglosado.

El pool vigente de LUM-042 se lee del runtime. Para la rama dañada canónica esperada,
`physical/reserved/notSellable/sellable` cambia `12/0/0/12 → 13/0/1/12` en la
disposición. El espécimen `6/1/0/5 → 7/1/1/5` queda como test puro aislado; no migra
seed, no transforma SKUs y no certifica SC22.

## 3. Grafo y objetos de flujo

El único ledger sigue siendo `aftercare`. El flujo nuevo contiene cinco objetos con
una responsabilidad cada uno, ordenados por un coordinador:

1. `RequestReturnStep`: selecciona cantidades parciales por línea y motivo.
2. `ReceiveReturnStep`: registra recepción/aceptación de todas las cantidades del
   expediente; no modifica stock ni dinero.
3. `InspectReturnStep`: registra observación neutral y notas internas; no clasifica,
   no modifica stock y no reintegra.
4. `DisposeReturnStep`: elige una única disposición cerrada `Sellable | Damaged |
   Unknown` para el expediente y aplica el movimiento de stock atómicamente.
5. `RefundReturnStep`: deriva y registra el importe exacto del expediente; no modifica
   stock.

Los pasos posteriores a la solicitud procesan íntegramente las líneas seleccionadas.
Este corte no introduce recepción parcial dentro del expediente ni disposición mixta.

El tipo cerrado de etapa incorpora el recorrido nuevo:
`Submitted → Received → Inspected → Disposed → Refunded`.
El codec conserva y acepta los recorridos históricos ya válidos; no inserta Review o
Approved ficticios. Históricos avanzados sin evidencia operativa nueva permanecen de
sólo lectura y no autorizan repetir efectos. Cualquier wire futuro es `Unknown` y
bloquea mutaciones.

`ReturnRecord.actorId` continúa identificando al comprador. Cada evento operativo
nuevo registra por separado el actor interno que ejecutó el paso. Las notas internas
de inspección no forman parte de la proyección Customer.

## 4. Autoridad y políticas compartidas

- Admin y Operator leen y ejecutan los comandos SC21.
- Customer y Unknown son denegados antes de leer datos administrativos y nuevamente
  dentro de cada transacción.
- El detalle es una feature dedicada; `DemoPageComponent` no recibe nuevas reglas.
- Logística reutiliza los comandos/proyecciones SC20. No se habilita ningún bypass
  legacy ni se duplica una política de entrega.
- ORD-1012 permanece bloqueado por pago pendiente; ORD-1013 exige tracking manual;
  ORD-1014 conserva tracking; ORD-1017 es retiro sin tracking; ORD-1022 permanece en
  revisión de stock; ORD-1015 no permite editar tracking.
- Resolver ORD-1019 cambia sólo su incidencia operativa `Open → Resolved` y registra
  evento. No entrega el pedido ni cierra consultas Customer independientes.
- Unknown, combinación incoherente, sesión/epoch cambiado, lectura stale y pérdida de
  writer bloquean comandos sin efectos.

El detalle y la cola consumen las mismas proyecciones cerradas de pago, fulfillment,
retiro, incidencia y posventa. El destino de retorno es un objeto cerrado que conserva
`q`, los seis ejes y `focus`; Admin y Operator regresan a Pedidos. Un acceso directo
sin criterios regresa de forma segura a la cola.

## 5. Persistencia, idempotencia y recuperación

Cada intento tiene identidad estable por expediente, paso y comando, con payload
canónico:

- mismo ID y mismo payload aplicado: `AlreadyApplied`, sin nueva revisión, evento,
  stock ni reintegro;
- mismo ID y payload distinto: `Conflict`;
- otro ID para una fase ya consumida: `Blocked`.

Los resultados `Editing | Reviewing | Saving | Applied | AlreadyApplied | Blocked |
Conflict | Failed | Unauthorized | Unknown` son un tipo cerrado. No se interpretan
mensajes.

Avance, evento, disposición, movimiento de inventario y revisión se persisten como una
transacción mediante writer/CAS/readback existentes. La disposición modifica una vez
el pool SKU y `notSellable`; el reintegro no vuelve a tocar stock. La migración es
aditiva: diferencia ausencia legacy válida de campo nuevo malformado y nunca resetea,
reemplaza o borra ledger existente.

Un fallo recuperable conserva formulario e identidad dentro del mismo actor, epoch y
pedido. No hay reenvío automático: actualizar → revisar estado vigente → reconfirmar.
Duplicado confirmado muestra resultado cerrado, no un retry ciego. Cambiar actor,
sesión, epoch o pedido invalida borrador, diálogo, callback y anuncio pendiente.

## 6. Experiencia de detalle

Cabecera: `Pedido ORD-…`, fecha disponible y ejes Pago/Pedido/Entrega separados.
Incidencia y posventa nunca se fusionan con pago. Comprador, modalidad, tracking y
precios sólo se muestran cuando existen en el modelo.

El resumen acumulado muestra inicialmente:

- 1 unidad reintegrada / 1 disponible;
- productos reintegrados $84.500;
- productos sin reintegro $84.500.

El expediente activo es independiente del historial: un único CTA siguiente, pasos
completados consultables y pasos futuros con el motivo de bloqueo. Timeline contiene
sólo eventos registrados; fecha desconocida se etiqueta como tal. La divulgación Demo
es breve y el comprobante es expresamente no fiscal.

Estados obligatorios: loading, error recuperable, pedido inexistente, acceso denegado,
Unknown, conflicto, duplicado, fallo de persistencia y pérdida de autorización. Cada
diálogo nativo tiene nombre, foco inicial, trap, Escape, fondo aislado, errores ligados
a campos y restauración contextual. Cambio de pedido limpia anuncios anteriores.

Responsive: composición principal/secundaria a 1440; una columna operativa priorizada
a 768; fichas completas sin tabla comprimida ni scroll horizontal a 390/320. Texto al
200 % no solapa ni recorta.

## 7. Matriz mínima ejecutable

- ORD-1015 entrada, solicitud, recepción, inspección, disposición Sellable y Damaged,
  reintegro y acumulado final.
- ORD-1012 pendiente; ORD-1013 preparación/tracking; ORD-1014 enviado; ORD-1017
  retiro; ORD-1019 incidencia abierta/resuelta; ORD-1022 stock review.
- Missing, access denied, Unknown, lectura fallida, escritura fallida, conflicto,
  duplicado, reload y segunda pestaña read-only.
- Customer recibe una proyección segura del avance sin notas internas ni comandos
  administrativos.

## 8. Gates antes de aprobar implementación

1. Unitarios de tipos/traductores, grafo nuevo e histórico, Unknown, dinero y cantidad.
2. Recepción/inspección sin stock; disposición exacta Sellable/Damaged; reintegro sin
   stock; replay después de reload e IDs conflictivos.
3. Rollback byte-exacto ante quota/CAS/readback; actor/epoch/pedido cambiados.
4. Regresión conjunta SC14/SC20: historial preservado, cola/detalle con igual
   proyección, logística/incidencia sin bypass.
5. `npm run verify`, lint, arquitectura y builds Real/Demo.
6. Browser owner SC21 y regresión CTA: Admin/Operator, 1440/768/390/320, texto 200 %,
   teclado, foco, Escape, axe y capturas de cada diálogo/resultado crítico.

SC21 sólo puede declararse cerrado después de dos revisiones Astra independientes sobre
el fingerprint exacto del código y evidencia final. Stitch global permanece abierto y
no se sustituye por afirmaciones de equivalencia visual.
