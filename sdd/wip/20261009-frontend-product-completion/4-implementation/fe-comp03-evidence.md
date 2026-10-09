# FE-COMP-03 — devolución parcial, inspección y reembolso demo

Fecha: 2026-10-09. Base C02: `437fabbff3f85238aae6949ad1c3b702108c1cfe`. Código probado: `cf609c1f7b3d79f209501a57714e156b23b125cc`, branch `integration/storecore-comp03-postsale`. El commit documental posterior no cambia producto. Estado: `implemented_local_pending_independent_review_and_ci`.

## Comportamiento y criterios

E03.1: el comprador abre un pedido propio entregado y pagado, selecciona variantes históricas, cantidades y un motivo cerrado por línea. Ve el precio pagado y el reintegro solicitado antes de enviar. Las solicitudes conservan snapshots de nombre/variante/importe; un cambio posterior del catálogo no cambia el reintegro. Puede cancelar únicamente su solicitud pendiente de decisión. Cancelación idempotente libera la cantidad para otra solicitud, conserva historial y no modifica existencias ni dinero. Cantidades disponibles restan solicitudes activas y devoluciones completadas, excluyen rechazadas/canceladas y nunca exceden lo comprado. El comprador distinto no accede al detalle ni a sus solicitudes.

E03.2: la cola en pedidos y resumen admin filtra por todas/pendientes/recepción/reintegro/finalizadas, con contador derivado de la misma selección. Abre el pedido original. El comercio aprueba o rechaza con motivo obligatorio; después de aprobar registra recepción e inspección con disposición por línea: apto para stock o cuarentena. Sólo la inspección apta aumenta la variante original, con movimiento único. Reembolso es un comando posterior y no toca stock. Pedido conserva total original, importe acumulado reintegrado y saldo conservado. Historial, comprobante e información de comprador/admin comparten los mismos eventos.

E03.3: solicitudes por command ID rechazan reutilización con payload distinto; decisiones, inspección y reintegro idénticos son idempotentes. La cantidad y el dinero acumulados se validan también en el traductor de persistencia. El precio neto/descuento por unidad de C02 está congelado; la política de asignación en centavos distribuye residuo de forma estable. El costo de entrega sigue separado y se conserva. Comprobante `SIM-REFUND` identifica la simulación y el medio original, sin prometer un reintegro bancario.

Estados, motivos, disposición y filtros están en tipos cerrados con `fromWire`/`Unknown`. Dominio en `demo-postsale.ts`: política de cantidad, asignación de dinero, decisión, inspección y reintegro con responsabilidades propias. UI en componente separado. Snapshot v3 acepta v1/v2 mediante el traductor existente y rehidrata tipos. `returned` sólo se lee para migración histórica: el antiguo comando booleano fue retirado. Una recepción legacy pasa a `Legacy`, requiere conciliación y no inventa inspección, reintegro ni reposición. Unknown no autoriza comandos.

## Evidencia ejecutada

- `npm test -- --watch=false`: **336/336 PASS**, 76 archivos, salida 0, código `cf609c1`, 2026-10-09 16:09:17 UTC. Incluye propiedad, cantidades inválidas/Unknown, dinero congelado, acumulación de parciales, idempotencia, cancelación, decisión/rechazo, cuarentena/stock, migración y comprobante.
- `npm run lint`: **PASS**, salida 0, mismo código.
- `npm run check:architecture`: **6/6 PASS** y scan PASS en el corte; responsabilidades nuevas siguen fuera del dominio productivo real.
- `npm run build:demo`: **PASS**, código `cf609c1`, 2026-10-09 16:09:47 UTC; bundle inicial 2.17 MB de desarrollo.
- Regresión inicial `node demo-e2e/run.mjs`: **36/36 PASS**, salida 0, 179.2 s; conserva reporte `frontend/demo-playwright-report/comp03-full-regression.json`. Esta corrida precede cancelación/filtro y no se representa como ejecución final.
- Regresión focal `node demo-e2e/run.mjs postsale.spec.ts cta-matrix.spec.ts`: **12/12 PASS**, salida 0, 1.9 min. La última corrección posterior sólo retira un método legacy sin CTA; la corrida final completa se registra abajo. Reporte preservado `frontend/demo-playwright-report/comp03-cta-postsale-final.json`.
- CTA focal: **416 controles baseline ejecutados, 0 faltantes** en matriz existente; **13/13 familias nuevas** instrumentadas por click/input/change: cantidad, motivo, solicitud, nota, aprobar, rechazar, inspección/disposición, recepción-inspección, reintegro, alerta/destino, fila de cola, filtro y cancelación. Esto verifica acciones, además de los datos esperados por criterio; no equivale a contar clicks solamente.
- Browser de postventa: compra multilínea → entregar → solicitud parcial → cola admin → aprobar → inspección apto/cuarentena → reembolso → comprador/comprobante/reload, a 390/768/1440. Stock apto aumenta exactamente 2 unidades; cuarentena 0; reintegro mantiene ese stock. Axe **0 violaciones** en comprador/admin por viewport, sin overflow horizontal. Caso adicional: cancelación previa, rechazo con/sin motivo, conservación de stock/dinero y aislamiento de `cliente2` frente a `cliente`.
- Todas las solicitudes de red browser validan hostname `127.0.0.1` y prohíben `/api`; pago/envío/ML reales no fueron llamados.
- `npm run build -- --configuration production --preserve-symlinks`: **FAIL ambiental local**, descarga de Inter desde `fonts.googleapis.com` sin permiso de red. No es PASS ni fallo atribuido a la implementación. Coordinador repite con su permiso de red/CI y registra por separado.

Corrida completa final `cf609c1`, `npm run build:demo` seguido de `node demo-e2e/run.mjs`: **37/37 PASS**, salida 0, 3.0 min, iniciada 2026-10-09 16:09:48 UTC. Incluye toda la regresión previa, nuevas cancelación/filtros/saldo y las 13 familias CTA. Cero tests skipped/flaky/unexpected. El runner cerró servidor y browsers; check final puerto 4390: 0 listeners.

Artefactos locales: `frontend/demo-playwright-report/results.json`; capturas `frontend/test-results/postsale-*/buyer-return.png` y `admin-refund.png`; attachments `post-sale-data`, `rejection-data-trace`, `post-sale-cta-coverage`, `executed-cta-matrix`. Reportes y capturas son artefactos locales ignorados por Git, no contenido productivo. Los runners cierran sus procesos al salir y se desmontan los drives temporales.

## Gates y continuación

G-T/B local acreditados por las pruebas descritas. G-U independiente por Sol/UX/producto, G-R hosted CI y el cierre formal de G-D siguen pendientes del coordinador; no hay push/PR/merge de este agente. El frontend demo no cierra auth/ownership/transacciones de reembolsos backend ni homologación real.

El backend futuro debe validar actor/realm y elegibilidad en servidor, congelar asignación de dinero, asegurar idempotencia durable y transacción de inspección/stock, registrar reembolso real y estados de proveedor con conciliación. FE-COMP-04 continúa con modalidad de fulfillment e inbox persistente; las alertas de postventa de este corte son eventos durables locales con ID/actor/pedido/destino, pendientes de esa política de lectura/resolución.
