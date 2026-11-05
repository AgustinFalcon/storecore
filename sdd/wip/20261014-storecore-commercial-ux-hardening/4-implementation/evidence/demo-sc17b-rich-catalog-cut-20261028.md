# SC17B — catálogo enriquecido Demo (plan y evidencia)

Base `9a22469`. Estado inicial: **in_progress; gates no ejecutados**. Sólo frontend Demo; sin proveedor, fiscal, backend, HTTP ni homologación. TASK-014 global sigue pendiente.

## GO y compatibilidad

El padre autorizó snapshot **v5 aditivo `catalogDetails` por SKU**, sin reemplazar el pool físico/reservado compartido de Standard/Case. Se conserva identidad de SKU/presentación, carritos, pedidos, reservas, precios históricos y aftercare. No se distribuyen ni duplican existencias entre variantes. Stock independiente y variantes arbitrarias requieren corte transversal posterior/SC22. Outlet vendible tiene SKU propio por unidad/lote y pool propio; no se agrega un unitId invisible al carrito.

El dominio rich existente es referencia selectiva, no un adapter listo: usa otro contrato de stock por variante, writer con commit(true)/jobs ML y create con stock/foto ficticios. No se conectan esos comandos. Se reutilizan tipos/policies seguros, convergiendo publicación en un único tipo cerrado. Precios por presentación son base/lista seguros, aplicados derivados; `lista>=base` se valida antes de promociones. No descuento implícito por Outlet.

## AC del subcorte

1. Migración explícita v1–v4 existente → v4 → v5 pura, sin persistir al leer, agregar seeds a snapshots previos ni reasignar reservas. `catalogDetails` ausente sólo en legado migra; v5 ausente/null/parcial/malformado falla cerrado. Roundtrip estable, todos los SKU exactamente una entrada, referencias conocidas y cantidades seguras.
2. Media local registrada/allowlisted, IDs/alt acotados y únicos, portada/orden/remoción con mínimo uno, navegación/foco/anuncio de teclado. Nada external/data/blob/javascript/traversal. El padre autorizó tres JPG fotorealistas generados para la Demo: disclosure explícito en editor/galería/zoom exige reemplazarlos por fotos reales de la unidad antes de publicar. DEMO-001 Nuevo conserva dos ilustraciones neutrales; las imágenes de abolladuras/marcas pertenecen sólo a los especímenes Outlet simulados. No son fotografía real ni evidencia técnica.
3. Variante Standard/Case con estado cerrado Active/Disabled/Unknown y precios propios seguros; pool stock compartido explícito/readonly. Conservación de variantes históricas, al menos una activa incluso con saldo cero; reservas/carritos bloquean desactivación insegura. Unknown falla cerrado sin imprimir wire crudo.
4. Condición de artículo Nuevo/Reacondicionado/Usado separada de Outlet y alcance Unidad/Lote. SKU Outlet identificado, referencia/defectos/condición/garantía/media propios, unidades/lote y no-vendible coherentes con su pool. No convertir stock genérico en múltiples unidades vendibles ni inventar evaluación/reacondicionamiento.
5. Editor Admin/Operator reutiliza guard, CAS, actor/epoch y rollback SC17A; create limpio y stock0; metadata/media/precios no alteran stock, carritos, pedidos, aftercare, movimientos, listings ni syncJobs. No writer rich/queueStock por editar.
6. Buyer catálogo/PDP/preview usan media/config/precio/estado persistidos y disclosure antes CTA. Selección→cart→checkout→resultado conserva presentación/precio; histórico no se recalcula. Unknown/disabled/archived no comprables y no autoacciones. Factura/pago/garantía son textos honestos Demo: no facturación real ni flujo «sin factura».
7. Responsive320/390/768/900/1440, text2x real sin solape/overflow, teclado/dialog/foco/error asociado/Axe. URL/retorno de SC17A y continuidad comprador se preservan.

## Plan / tareas

SDD primero → codec/migración/policies puros → comandos transaccionales con expected fingerprint completo → editor/media/variantes/Outlet → proyección buyer → unit/component/owner/CTA → verify/full Demo → reviews independientes/evidencia exacta. Cada paso es objeto con responsabilidad única; dominio sin framework/UI/HTTP.

Tests requeridos: legacy pending Standard/Case sin repartir reservas; v5 malformed/Unknown/doubledecode; media inyección/inexistente/duplicada; original<base aun con oferta; MAX_SAFE y cantidades imposibles; desactivar última/reservada/en carrito; idempotencia/actor/epoch/destroy/stale/two-tab/quota/rollback; producto simple/OutletUnit/Lot y diferencias condición/alcance; importes de todas las superficies e histórico intacto; media reorder/portada/foco y acceso guest/Customer/Admin/Operator/Unknown.

## Checkpoint histórico local 2026-10-28 (antes de gates finales)

Implementados codec/migración v5 aditivos, configuración Standard/Case sobre pool compartido, comparador Case cerrado no disponible si original legado+extra excede safe integer, media registrada, editor dedicado y proyecciones buyer/preview. Tres SKU Outlet nuevos separados del stock previo; v4 migrado no recibe nuevos seeds. Nuevas líneas de pedido congelan condición/garantía/portada y notas/defectos Outlet aceptados; líneas legacy ausentes no se completan con datos actuales. Listado, dashboard y buyer comparten disponibilidad físico−reservado−no-vendible; Unknown no se presenta como cero fiable.

`npm run verify` PASS 20:36:32 UTC: boundary 6/6, architecture scan, lint, Angular 615/615 (96 archivos), build Real. `build:demo` PASS 20:28:42 UTC. Owner SC17B 8/8 PASS 20.9s: selección activa/disabled, galería/zoom, Case propio, compra→editar catálogo→resultado/detalle/reload con términos históricos, reorder/ARIA/quota y cinco anchos con Axe y text2x real/rectángulos sin solape. Owner SC17A 14/14 pasó en la reejecución previa; suite CTA y full Demo finales aún pendientes, no se reclaman PASS.

Intentos previos documentados: unit global 603/606 y luego611/612 detectaron fixtures de versión/edición directa incompatibles y una consulta renombrada demasiado específica; corregidos manteniendo las invariantes. Primer owner22 tuvo14PASS/8FAIL: contraste del enlace PDP y precedencia de validación/foco eran defectos reales corregidos; las otras expectativas dependían de nombres de controles/opción disabled y fixtures enriquecidos. Posterior owner rich7/8 falló por locator del atributo name dinámico; se usa nombre accesible real y8/8 pasa. Primer CTA fue interrumpido tras timeout de lectura de ID antes del render; segundo15/18 detectó expectativa errónea de producto más caro y selector de error ambiguo (alerta shell+modal); corregidos, sin claim de gate verde. Se agregaron regresiones, no se desactivó Axe ni se relajaron invariantes.

Inventario CTA incorpora las nuevas plantillas rich. Contabiliza acciones visibles habilitadas, no comandos deshabilitados (los owner verifican explícitamente sus fences); conserva exigencia de ejecutar todo CTA estático y todo CTA habilitado observado. Los controles media se ejercitan por UI incluyendo reordenar/remover y descarte, sin invocar handlers directamente.

## Cierre local 2026-10-28 20:59 UTC

- `npm run verify`: PASS 20:44:51 UTC, boundary 6/6 + architecture scan + lint + Angular **616/616** (96 archivos) + build Real. Incluye traductores de todos los tipos cerrados nuevos y pruebas component de galería/buffer/ARIA.
- `npm run test:demo`: build Demo PASS 20:51:48 UTC; Chromium **169/169 PASS** en 6.8m. JSON `startTime=2026-10-28T20:51:49.672Z`, duración405858.567ms, expected169/unexpected0/skipped0/flaky0; `.last-run` passed, failedTests[].
- Incluidos owner SC17A14/14, owner SC17B8/8 y matriz CTA18/18 con inventario final sin acciones pendientes. La ejecución CTA focal separada también pasó18/18 (2.4m). Focal rich15/15 y regresiones legacy SC03/SC16 2/2 PASS antes del full final.
- Cinco anchos320/390/768/900/1440, Axe sin desactivar reglas, diálogo/foco/teclado y aumento real text2x con comparación de rectángulos: capturas finales en `frontend/test-results/rich-catalog-sc17b-*` (PDP, zoom y editor; 1440 agrega `pdp-text-200-percent.png`). El autor inspeccionó PDP320/text2x1440 y no detectó solape ni importes partidos; revisión UX independiente final/exact-SHA permanece gate de promoción.
- Primer full169:165PASS/4FAIL. Fallaron count legacy SC16 (3categorías vs4 con Outlet), helper CTA que leía enabled antes del render del reordenamiento + fallout del afterAll tras restart, y SC03 intentando click en una variante Unknown ahora deshabilitada. Se corrigieron fixtures/esperas: count derivado de categorías, assert de posición DOM tras cada movimiento y assert explícito Unknown+disabled+carrito0/storageexacto (cantidades inválidas siguen exigiendo click→alert). Sin forceclick, sin aumentar retries/timeouts, sin omitir tests. El segundo full arriba es el resultado final, no el intento165.
- `git diff --check` y parse JSON tareas PASS. No commit/push, no CI ni backend/proveedores; TASK-014 global sigue pending.

## Compatibilidad y rollback

Leer v1–v4 traduce en memoria mediante la cadena existente y el paso v4→v5; no escribe localStorage ni agrega los especímenes nuevos a datos guardados. La próxima escritura autorizada usa v5 y la misma transacción CAS/write-readback: fallo/cuota/conflicto conserva el snapshot previo y el borrador editable. Identidades, pools, reservas y hechos históricos existentes no se redistribuyen. Legacy sin hechos comerciales de línea se muestra como no registrado, no se completa desde el catálogo actual.

Un build antiguo que sólo reconoce hasta v4 no puede interpretar v5: debe fallar cerrado. No hay downgrade automático ni backup automático nuevo. Un rollback operativo requiere conservar el raw v4 original antes de la primera escritura v5, o usar un build compatible hacia adelante; no se debe eliminar `catalogDetails`/hechos de línea de una compra nueva para fingir compatibilidad y perder términos aceptados. No se verificó un despliegue/rollback remoto.

## Residuales del alcance

SC22 operaciones de stock por variante independiente; variantes arbitrarias; proveedor/fiscal/ML; Real parity; reemplazo de imágenes generadas por fotografías reales de la unidad y validación comercial antes de publicar; cierre global TASK-014/Stitch/CI/exact-SHA. Los PASS anteriores son exclusivamente locales y acotados, no homologación ni cierre global de superficies.
