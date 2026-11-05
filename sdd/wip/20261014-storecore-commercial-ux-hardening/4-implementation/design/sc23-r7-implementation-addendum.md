# SC-SURF-23 R7 — addendum implementable Mercado Libre Demo

Estado: candidato a aprobación. Fecha: 2026-11-04. Base: `64c11f9`.

## Precedencia y límites

Prevalecen este addendum y SC17/20/21/22 sobre R6/manifests/Stitch. R6 deja de ser
autoridad para cuentas, IDs externos, SYNC/CMP, fechas, HTTP, costos, márgenes o ACK.
Real permanece GET-only. Competencia es lectura/recomendación no accionable: sin
aprobación, repricing ni cambio de seguimiento. Demo no llama proveedor, OAuth,
webhook ni backend y siempre se rotula simulación local.

## Baseline

Se preservan 17 SKU, cuenta desconectada, cuatro asociaciones locales heredadas
DEMO-001…004, observados 18/19/20/21 sin fecha/origen, cero jobs y competidor sin SKU.
`linked=true` legacy no prueba mapping externo completo ni frescura. DEMO-001 tiene
vendible 17, precio base $12.500 y efectivo $11.250. No se inventan publicaciones,
variaciones, cuentas ni mappings; migración aditiva y Unknown seguro.

## Modelo cerrado

Cuenta y mapping poseen estado/generación. Hechos locales, deseados, observados y
confirmados son distintos. Tipos de intención:

- `StockIntent`: captura `InventoryPool.sellable` vigente.
- `PriceIntent`: centavos seguros deseados para canal, sin editar Catálogo/ofertas.
- `PublicationIntent`: `Publish | Pause`.

Se serializa por mapping+generación+destino+tipo. Stock, Price y Publication nunca se
reemplazan entre sí. Cada intención contiene commandId/payload; cada retry crea intento
nuevo. Eventos tipados: `Queued | Sent | SimulatedConfirmed | SimulatedRejected |
Superseded | Unknown`. Sólo el CTA separado “Simular resultado” aplica outcome; crear o
reintentar no cambia observado. Eventos tardíos de otro intento/mapping/generación son
Superseded y no pisan el vigente. Igual ID/payload es AlreadyApplied; payload distinto,
Conflict.

Conectar, desconectar y completar mapping son simulaciones locales confirmadas. Cambio
de mapping/generación cerca eventos previos. Ningún comando modifica inventario,
reservas, pedidos, catálogo o precios históricos. `queueStock/processStock/mlSale` no
son owners SC23 ni se usan desde la feature; jobs legacy se muestran como evidencia
parcial y no se confirman por igualdad de valores.

Admin/Operator se autorizan dentro de comandos. Customer/Unknown son denegados antes de
datos privados y dentro de transacción. Writer/CAS/readback, actor/epoch y recuperación
siguen SC21/22: fallo conserva propuesta, actualizar sólo lee y exige revisar/reconfirmar.

## Experiencia

Ruta `/demo/user/mercadolibre`, cinco áreas: Cuenta, Publicaciones, Sincronización,
Actividad y Competencia. URL conserva pestaña, búsqueda, tipo/estado y foco. Todos los
17 SKU son alcanzables con paginación; métricas globales y `X de Y` filtrado.

Publicaciones separa vínculo local, mapping, estado observado y publicación deseada.
Sincronización muestra objetivo, valor solicitado, último observado conocido, intento
vigente y siguiente acción. Precio local/efectivo, deseado y observado no se mezclan.
Jobs distinguen cola, enviado, confirmado simulado, rechazado y superseded. Historial
legacy no inventa fecha, actor, envío ni ACK.

Competencia sin SKU no se atribuye automáticamente. Sin identidad, evidencia vigente,
costo o piso: “No evaluable”, sin recomendación numérica/confianza inventada.

Estados: loading, empty, no-results, access denied, Unknown, conflicto, validación,
quota/readback, writer perdido y missing mapping. Diálogos nativos nombrados, revisión
explícita, foco post-render, trap/Escape/restauración y fondo aislado. Tabla 1440,
tarjetas 768, columna 390/320, texto 200 %, tabs con flechas/Home/End y axe.

## Gates

1. Codec viejo/nuevo, tipos/Unknown, mappings/generaciones e importes/cantidades.
2. Independencia Stock/Price/Publication, neto SC22 correcto y cero efectos de dominio.
3. Simulación explícita, retry, duplicado/conflicto, eventos tardíos, remap/disconnect.
4. Reload, CAS/quota/readback, dos pestañas, actor/epoch y borrador preservado.
5. Competencia/history honestos; Real GET-only y Demo sin red/proveedor.
6. Regresiones SC14/17/20/21/22, CTA, verify/builds y browser cuatro anchos/a11y.

Cierre requiere dos reviews Astra sobre fingerprint exacto. Stitch global sigue abierto.
