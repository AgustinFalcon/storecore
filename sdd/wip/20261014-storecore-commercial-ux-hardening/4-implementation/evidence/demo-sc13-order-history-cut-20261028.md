# SC13 — historial comprador Demo (2026-10-28)

Base: `993074c`. Estado: `verified_local` sobre el delta sin commit. Gates locales ejecutados; reviews de SHA final y CI pendientes.
TASK-012 global permanece pending: este subcorte no completa posventa SC14 ni Real.

## Contrato y aceptación

- CUSTOMER exclusivamente; filtrar ownership antes de buscar, contar, ordenar o presentar. USER Admin/Operator no acceden a datos comprador.
- Fechas con precisión cerrada día/instante/desconocida y decoder estricto. Día no inventa hora; instante se muestra en Buenos Aires. Legacy sin fecha permanece sin fecha; jamás inferir IDs/history ni escribir al leer. Pedido nuevo captura el clock inyectado una vez para createdDate e historial.
- Cronología por día civil de Buenos Aires descendente; dentro del mismo día los registros con precisión día preceden a los instantes (hora no informada, no medianoche inventada), y los instantes se ordenan por tiempo real. Desconocidas al final, empates preservan orden de origen, nunca ID. Filtro de pago cerrado completo, búsqueda ID/SKU/nombre histórico, página de cinco pedidos; query inválida visible/recuperable. URL conserva filtros/página al recargar y volver del detalle.
- Tarjetas con fecha, productos/variantes/cantidades/precios históricos, pago y entrega separados, total registrado y acción de navegación explícita. Presenter SC12 conserva advertencias de datos inconsistentes/Unknown sin divulgar incidentes operativos ni inventar tracking.
- Diferenciar cuenta vacía, sin coincidencias, acceso no disponible y error durable; no spinner HTTP ficticio. No autoacciones de pago, stock, reservas o devoluciones.
- Foco h1 al entrar; paginar enfoca contexto de resultados; escribir/filtrar no roba foco. Reflow/teclado/Axe en 320/390/768/900/1440, ampliación 200%.

## Diseño / límites

Feature dedicada `demo/orders/`, pasos puros authorize/filter/sort/page/present, adaptador Angular URL/DOM. Único traductor de criterios URL; retorno del detalle acepta sólo esos criterios, nunca un destino arbitrario. Sin backend, schema ni migración; createdDate ya es opcional en snapshot. Fixtures adversariales ricos en tests: fechas lexicalmente distintas del ID, empates, offset/day/invalid, líneas históricas Case2, terminales, foreign y vacío.

Autorización adicional del corte: los tres fixtures de pedidos del nuevo demoSeed registran ahora `2026-10-08`, coherente con el día explícito ya presente en su history de muestra. No se agregan pedidos, actores, stock ni horas; el decoder no migra fechas de snapshots persistidos. Owner/unit conservan legacy explícito sin fecha. Incidentes operativos se omiten en el nuevo historial; el detalle legacy y posventa SC14 quedan fuera del cierre de este subcorte.

## Evidencia local ejecutada

- Focal Angular `npm run test -- --include=src/app/demo/orders/*.spec.ts`: 2 archivos / 7 tests PASS (15:48:37 UTC); después incluidos en verify final. Fecha estricta, civil BA/offset/ties/Unknown, filtros/URL, ownership-first, precio histórico, page clamp, clock de creación/idempotencia, actor/reactividad y foco sin robo por scenario.
- Owner + CTA dedicados: `npx playwright test --config playwright.demo.config.ts order-history-sc13.spec.ts cta-matrix.spec.ts`, 24/24 PASS. La corrida final completa vuelve a ejecutar los 10 owners y 14 escenarios CTA sobre todos los cambios finales, incluyendo seed y filtros inválidos en cuenta vacía.
- `npm run verify` final: architecture/boundary 6/6 + scan PASS; lint PASS; 87 archivos / 546 tests Angular PASS; build Real PASS (15:55:52.639 UTC).
- `npm run test:demo` final: build Demo PASS (15:56:45.315 UTC); 117/117 PASS, start `2026-10-28T15:56:46.030Z`, duración `254111.009ms`, 0 unexpected / skipped / flaky; retries=0. `test-results/.last-run.json`: passed y failedTests vacío. Resultado en `frontend/demo-playwright-report/results.json` (artefacto local ignorado).
- Screenshots regeneradas por corrida final: `frontend/test-results/order-history-sc13-SC13-responsive-keyboard-and-Axe-{320,390,768,900,1440}/history-{width}.png`; ampliación real de texto en `...-1440/history-text-200-percent.png`. Esa prueba duplica cada font-size computado del historial, exige h1 exactamente 2x, ausencia de overflow horizontal y controles visibles. No se etiqueta un viewport reducido como zoom real. Axe sin violaciones en los cinco tamaños; esto no certifica WCAG global.
- `git diff --check` PASS. Sin backend, red externa, proveedor, schema, migración, commit ni push por este agente.

## Hallazgos corregidos y límites honestos

Los primeros intentos no fueron verdes: comando focal antes de existir specs (sin tests), test de clock contando usos de pricing/stock además de creación (fixture aislado a propósito), fixtures de historial con SKU inexistente o reservas huérfanas, robo de foco diferido al escribir tras paginar, assertions de tabla obsoletas tras pasar a tarjetas y alerta duplicada. Los fixtures ahora pasan el decoder real antes de browser; no se debilitaron las comprobaciones de autoridad/foco/storage. El reloj de creación se captura una vez para createdDate e history; pricing/stock conservan sus usos anteriores del clock.

Review UX identificó dos P2 corregidos: comparación incorrecta Day UTC vs Instant BA y evidencia falsa de 200% basada sólo en viewport. La política civil explícita, regresión exacta 01/10 vs 30/09 22h y text resize real cierran ambos en código y gates. Una primera full117 verde quedó histórica al añadir seed dates y recuperación de query inválida en cuenta vacía; la corrida final registrada arriba reemplaza su evidencia.

El complemento SC14 de este corte se limita al retorno allowlisted q/payment/page desde detalle al historial. El detalle legacy, incidentes customer-safe, timeline rica, devoluciones parciales/reintegros y sus agregados siguen pendientes; omitir notas internas en la lista nueva no declara resuelto el detalle existente. Tampoco se completa Real, TASK-012 global, Stitch, homologación, integración, release ni deploy. Dos reviews independientes exact-head y CI: NOT_RUN por este agente.
