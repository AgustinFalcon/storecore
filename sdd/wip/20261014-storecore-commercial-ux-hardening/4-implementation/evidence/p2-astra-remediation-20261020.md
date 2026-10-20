# Remediación P2 — evidencia local 2026-10-20

Snapshot local inspeccionado: commit de respaldo
`85aece91294307d0fedb62b074af726055567884`, creado desde el worktree
`storecore-frontend-product-completion-sdd` con implementación todavía no separada
en PRs. El PR documental #186 registra esta evidencia, pero su propio head no
contiene ni acredita esa implementación. Referencia canónica: `design-manifest.json`,
especialmente `operationalLedger`. Esta auditoría corrige y amplía el corte local
SC03/SC20/SC21B anterior; sus resultados históricos no son una
certificación de este conjunto final de cambios.

## Contratos corregidos

- Alertas: `DemoAlertAudience` es cerrado. El comprador sólo recibe pagos e
  incidencias de sus propios pedidos y no dispone de reconocimiento de alertas.
  Los tests incluyen stock/canal artificialmente asociados al mismo pedido del
  comprador para evitar un PASS vacío basado únicamente en ownership.
- Inventario: reconciliar registra un movimiento cero por variante real; no
  introduce `variantId=all`. El snapshot resultante atraviesa serialización y
  decoder sin perder el historial.
- Fixture: doce pedidos exactos, compradores/contactos, fechas, estados,
  modalidades, tracking, líneas e importes de `operationalLedger`. Se verifican
  directamente contra el manifest desde Playwright. DEMO-001, LUM-042, VLD-043 y
  LMP-044 tienen los balances aprobados; LUM-042 queda publicado y LMP-044
  archivado. Los movimientos legacy contradictorios se reemplazan por balances
  de apertura y referencias a reservas reales ORD-1013/1017/1022. ORD-1015 inicia
  con dos unidades elegibles y ninguna devolución previa.
- Datos históricos: el ledger no informa el medio de pago; el fixture usa
  `DemoPaymentMethod.Unknown`. Se conserva su fecha grabada ISO, que ahora acepta
  el proyector cronológico sin inferir fechas desde los IDs.
- Decoder: valida coherencia pago/pedido/entrega y modalidad; cantidades de
  devoluciones individuales/acumuladas contra lo comprado, precio histórico de
  la línea, importe de reembolso, estado, inspección y disposición/inventario.
  No se confunde pago histórico reembolsado con una disposición local de RMA.
- Checkout: seleccionar domicilio exige Shipping habilitado antes de crear el
  pedido, reservar/consumir stock o vaciar el carrito.
- Favoritos Real: una respuesta de lista anterior a add/remove no reemplaza el
  resultado de la mutación; tampoco se inicia una lista durante una mutación.
- Persistencia Demo: **una pestaña escritora por origen mediante Web Locks**.
  El lock se adquiere antes del bootstrap Demo, se mantiene durante la vida del
  documento, se libera en `pagehide` y se solicita nuevamente al volver desde
  bfcache. Las demás pestañas pueden consultar y reciben una explicación para
  cerrar la escritora y recargar. Sin Web Locks o si el navegador rechaza el lock,
  la demo sigue navegable en lectura con aviso explícito y mutaciones bloqueadas.
  No se afirma que localStorage provea CAS ni transacciones entre pestañas.
  Los eventos de cuenta siguen siendo registros append-only independientes; un
  reset sólo limpia los eventos observados antes del reemplazo y conserva un
  evento concurrente nuevo. La entrada Real no importa ni adquiere este lock.
- CSV: la proyección conserva PaymentStatus/ShipmentStatus y el tipo cerrado
  OPEN/NONE hasta el serializador; convierte centavos a ARS y neutraliza fórmulas.
  Unitarias y descarga browser comprueban las filas exactas ORD-1012/1019 y que
  exportar no modifica el snapshot.
- Recuperación: el timer se cancela y se protege con generación/fase; una acción
  posterior o la destrucción del componente invalida el callback anterior.
- ORD-1021: `DemoRefundSummary` y `DemoRefundOrigin.HistoricalPayment` presentan
  “Reembolso registrado · monto no informado” y saldo no calculable. No se
  inventa $0, monto reintegrado ni disposición; su RMA sigue recibido y pendiente
  de inspección. Los reintegros locales conocidos, incluido el parcial de
  $84.500 sobre ORD-1015, conservan sus importes comprobables.

## Validación

- `npm test`: **144 archivos / 654 tests PASS**.
- `npm run lint`: **PASS**.
- `npm run check:architecture`: **6/6 PASS** y escaneo de dependencias PASS.
- `npm run build`: **PASS**, Real `748.79 kB` raw / `162.08 kB` estimado.
- `npm run build:demo`: **PASS**.
- Playwright Demo completo antes de la última proyección histórica: **66/66 PASS**.
- Playwright Demo completo, incluyendo ORD-1021: **67/67 PASS**, 2,8 minutos.
- Último delta de limpieza de reserva legacy huérfana y validación booleana de
  disposición: **7 archivos / 36 tests unitarios PASS**, seguido de build Demo y
  revalidación browser dirigida de inventario/P2 **12/12 PASS** sobre el bundle
  final. Full unitario posterior: **144 archivos / 654 tests PASS**.

Las primeras corridas browser detectaron expectativas antiguas de ownership,
mark-read comprador y una RMA preexistente en ORD-1015. Se corrigieron los tests
para ejecutar acciones válidas sobre el ledger canónico; no se alteró el ledger
para acomodar esas expectativas. Angular/esbuild no pudo resolver directorios en
el sandbox Windows; las verificaciones anteriores se ejecutaron fuera del sandbox.

## Límites y gates

No hubo commit, push, PR, merge, publicación ni despliegue. Se preservaron los
cambios locales de otros cortes. La fixture nueva se obtiene desde el seed o
Restablecer demo; no se sobrescribe automáticamente un snapshot de usuario ya
persistido. No se acredita CI alojado, SHA inmutable, homologación, aprobación
visual global ni cierre TASK-003/004/015/019/021. Los gates SDD permanecen abiertos.

## Re-review posterior — cinco P2, 2026-10-20

Se corrigieron los cinco hallazgos adicionales sin commit ni push:

1. **Reserva con dueño:** `DemoReservationState` y evidencia de líneas por pedido.
   ORD-1012 declara ausencia de reserva; cancelarlo no altera físico=7/reservado=2
   de DEMO-001 ni las reservas de ORD-1013/1022. Un checkout pendiente libera o
   consume sólo sus propias líneas. La salida de una reserva ya pagada consume
   esa reserva una sola vez. Un snapshot anterior sin evidencia queda `Unknown`
   y el comando de inventario se bloquea; no se adjudica stock ajeno.
2. **Favoritos:** una lista iniciada antes de un add/remove se reconcilia con un
   journal de cambios confirmados y tipados, en vez de descartarse entera. El caso
   `[OLD]` tardío después de agregar `NEW` termina en `[OLD, NEW]`; remove posterior
   tampoco se restaura por una respuesta vieja. Cambiar de actor limpia el journal.
3. **Recepción contabilizada:** `DemoReturnAccounting` distingue inventario aún no
   incorporado, recepción física retenida, apta, dañada y desconocida. ORD-1021
   inicia Held, físico=1/no-vendible=1. Clasificar Restock deja físico=1 y libera la
   retención; clasificar Damaged conserva físico=1/no-vendible=1. Las dos ramas
   hacen round-trip y rechazan repetir disposición. Un reembolso histórico ya
   registrado tampoco autoriza otro reintegro local. Las recepciones legacy sin
   evidencia suficiente permanecen desconocidas y no autorizan disposición.
4. **Incidencia cerrada:** `DemoIncidentState` es la autoridad para filtros, detalle,
   dashboard, exportación y resolución. ORD-1018 es Resolved y no aparece como
   Open ni ofrece otra resolución. El motivo permanece como historial/contexto,
   sin usarse como booleano para decidir estado. Reabrir registra Open explícito.
5. **Cuenta y writer:** restringir/reactivar exige autoridad antes de mutar el
   agregado y otra vez al escribir el evento append-only. La denegación conserva
   la cuenta y no crea eventos; perder autoridad antes del commit revierte la
   proyección local. El formato append-only de eventos se conserva independiente
   del snapshot, sin funcionar como una vía para evitar el lock.

Validación posterior al re-review:

- `npm test`: **146 archivos / 664 tests PASS**.
- `npm run lint`, `npm run build:demo`, `npm run build`: **PASS**.
- Arquitectura: **6/6 PASS** y escaneo PASS.
- Browser dirigido: **22/22 PASS**, 26,1 segundos (`p2-hardening`,
  `buyer-completion`, `customers-sc26`), incluyendo restricción y reactivación en
  pestañas de lectura, ambas disposiciones de ORD-1021 y cancelación ORD-1012.

La expectativa RealLocal `Inicio` y los cambios previos de otros cortes se
preservaron. El resultado browser 67/67 de la sección anterior corresponde al
corte anterior; no se presenta como una ejecución completa de este re-review.

### Copy P3 posterior al GO de seguridad

La guía pendiente, el CTA, la confirmación, el éxito y la entrada de historial de
cancelación derivan ahora de `DemoReservationState`. None informa sólo cancelación
de pago; Held explica la liberación de la reserva propia. Unknown bloquea el CTA y
el comando, y no se ofrece resolver un pago sin evidencia de reserva propia.
Tests focales de copy/ownership: **2 archivos / 10 tests PASS**. No se ejecutó full
suite ni build de distribución para este último delta mientras RealLocal corría
en el proceso del coordinador.

## Cierre funcional del corte final — 2026-10-20

La aceptación RealLocal se actualizó para seguir el contrato accesible vigente
del detalle operativo. El nombre completo de cada comando vive ahora en el tipo
cerrado `ShipmentTransition.actionLabel`; la vista y el E2E no concatenan textos.
El login del recorrido espera la instalación comprobable de la cookie opaca del
challenge antes de seleccionar contexto y evita leer una respuesta después de
una navegación. No se agregaron reintentos de autenticación ni se relajaron
guards, estados, firmas o evidencia durable.

- RealLocal administrado: **3/3 PASS** con PostgreSQL 16, 22 migraciones, backend,
  frontend HTTPS y Chromium. Evidencia SQL final PASS para pago aprobado, pedido
  pagado, acreditación única, reserva consumida, stock WEB descontado una vez,
  envío PREPARING→SHIPPED→DELIVERED y RMA RETURN_RECEIVED sin reposición inventada.
- Sobre el snapshot local `85aece9`, gate global Real: arquitectura **6/6 PASS**,
  lint PASS, **147 archivos / 667
  tests PASS** y build productivo PASS (`749.74 kB` raw / `162.22 kB` estimado).
- Gate Demo final: build PASS y Playwright completo **73/73 PASS** en 3,0 minutos,
  incluyendo superficies y CTAs comprador/administrador, 390/768/1440, writer
  exclusivo, P2 hardening, checkout, inventario, ofertas, ML, cuentas y 404.
- `git diff --check`: PASS tras normalizar el EOF de `product-detail.entity.ts`.

Los servicios, navegador y contenedor efímeros del gate RealLocal fueron cerrados
por el runner. Siguen separados los gates externos: evidencia visual Stitch,
CI alojado sobre SHA/PR, integración a rama destino y homologaciones de terceros.

La revisión Astra técnica posterior detectó un P3 en el test de detalle: etiquetas
y estados todavía se repetían como strings. Se corrigió el fixture para usar
`ShipmentStatus`/`RmaStatus` y derivar `actionLabel`/`requiresTracking` desde
`ShipmentTransition`. Validación focal **2 archivos / 16 tests PASS**, lint PASS y
re-review Astra **GO, sin P0–P3**. La revisión Astra de producto/seguridad también
emitió **GO, sin P0–P3**, sin afirmar cierre del gate visual Stitch.
