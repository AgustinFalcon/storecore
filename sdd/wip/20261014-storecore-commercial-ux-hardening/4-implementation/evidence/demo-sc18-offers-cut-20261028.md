# SC18 — Ofertas Demo, corte sobre 16b52c0

Estado local actual `verified_local` tras implementar y verificar las correcciones de los tres P2 reproducidos. GO del padre: superficie dedicada `/demo/user/offers`, Admin y Operator, sin backend/proveedor ni commit/push. Fuente producto nuevamente congelada. Los gates640/184 previos son históricos; los gates643/187 siguientes corresponden a las correcciones. Re-review independiente, exact-SHA y CI todavía pendientes; estos tests no sustituyen su aprobación. TASK-014 global continúa pending; SC19 permanece separado.

## Reapertura por review técnico — tres P2

1. Costo/piso/margen mínimo explícitos0 eran válidos al guardar, pero el formatter positivo del editor impedía reabrirlos. `OfferDraft` ahora formatea enteros no negativos por cociente/resto exactos, conserva0.00 y distingue null→vacío. No se flexibiliza el precio base positivo del catálogo.
2. Habilitar una revisión con final ya vencido podía pausar la fuente aplicada aunque la revisión no pudiera aplicar. Paso puro `ValidateOfferEnableWindowStep` deriva lifecycle como Enabled y rechaza Expired antes de cualquier mutación; comando y presenter comparten esa policy. Issue cerrado Expired visible, enable disabled; se conserva80100 deOFF003. Scheduled mantiene el contrato previo de conservar fuente hasta inicio.
3. El sentinel anterior era un SKU comercial permitido y podía colisionar. `LegacyOfferSku.fromWire/Unknown` conserva sólo SKU canónico; Unknown tiene wire no comercial y se veta por tipo en lifecycle/eligibilidad incluso ante una futura colisión. El validadorSKU canónico se reutiliza, sin cambiar su regla. Unknown es readonly y se etiqueta SKU no reconocido, sin imprimirlo como entidad comercial. Campañas y cotización previa permanecen intactas; se cubre producto homónimo presente y creado después.

Regresiones nuevas: tres unitarias exactas (cada cero por separado+null, revisión vencida sin mutación/preview y colisión presente/futura) y tres owner browser (reabrir ceros, expiry visible/disabled+precio, v5rawbyteexact→PDP/carrito21000). Primer focal nuevo falló sólo por import faltante de OfferLifecycleStep en test; corregido. Checkpoint22:41:04 UTC: focal Ofertas+Catálogo51/51 PASS; buildDemo22:41:20 PASS. En ese momento owner17+CTA19 y verify643 estaban en curso; los resultados vigentes se detallan debajo. Se agregaron escenarios sin quitar ninguno anterior.

### Gates post-fix de los tres P2 — cierre local vigente

- Verify PASS643/643 en98archivos + boundary6/6, scan arquitectura, lint y build Real22:42:54 UTC.
- Focal Ofertas+Catálogo PASS51/51 en4archivos22:41:04 UTC.
- BuildDemo PASS22:41:20 UTC; mismo código producto usado por el full final.
- Owner17+CTA19 PASS36/36 en2.8min, inventario global intacto. Los tres recorridos nuevos se ejecutaron por UI real, sin forceclick ni invocar handlers directamente.
- Full final `playwright test -c playwright.demo.config.ts --workers=2`: PASS187/187 en17archivos,4.9min. Son los184escenarios anteriores más3regresiones, sin recortes ni retries. Reporte: startTime2026-10-28T22:45:56.454Z, duration293022.914ms, expected187, skipped0, unexpected0, flaky0. `.last-run.json`: passed/failedTests[].
- Capturas finales owner de cinco anchos/Axe/text2x regeneradas en ese full. `git diff --check` PASS; puerto4390 sin listener al terminar. No se tocó `4-implementation/design/operator.md` ni se detuvieron servidores ajenos.
- Sin commit/push ni SHA final. Se solicitó re-review a ambos Astra; no se da por aprobado hasta su respuesta.

Compatibilidad: no se auto-reparan snapshotsv6 producidos por builds intermedios desde campaigns[] mutable ni se reinterpreta un SKU comercial legítimo como placeholder. Datos ya generados por el bug requieren revisión explícita; no se reescriben importes históricos silenciosamente. La migración v5→v6 corregida preserva las campañas originales y no aplica reglas antes no coincidentes.

## Contrato y AC

1. Snapshot v6 aditivo `offers[]`, migración pura v1–v5→v5→v6 sin escribir al leer ni insertar mocks en persistencia previa. v6 missing/null/malformed falla cerrado. `campaigns[]` conserva registros SC19, pero no se suma ni decide precios de ofertas. No seed fallback ni rewrite de pedidos/stock/aftercare.
2. Tipos cerrados con único fromWire: persistidos Draft/Enabled/Paused y fuente Policy/LegacyPreserved; lifecycle Draft/Scheduled/Active/Paused/Expired/Invalid/Unknown, elegibilidad Evaluated/NotEvaluable/Rejected/Unknown y selección Winner/Legacy/Superseded/None/Unknown independientes. Legacy aplicado se etiqueta compatibilidad, nunca política evaluada. Unknown no permite mutaciones ni etiqueta wire cruda.
3. Pasos puros Authorize→Decode→ValidateIntervalScope→EvaluateMarginFloor→Rank→Quote/Commit. Dinero entero en centavos; descuento/margen bps enteros y BigInt para productos/comparaciones. Descuento positivo usa redondeo half-up único: `(base*(10000-bps)+5000)/10000` con división entera; resultado<=0 o fuera safe integer se rechaza. Margen sobre venta: `(sale-cost)/sale`; comparación exacta `10000*(sale-cost)>=sale*minMarginBps`. Piso inclusivo `sale>=floor`; igualdad de margen se admite. No se redondea un margen mostrado para decidir. Sin stacking. Ranking prioridad descendente→descuento válido **bps**, no ahorro absoluto, descendente→startsAt instante reciente→ID ascendente. Ventanas de políticas nuevas normalizan offsets y usan inicio inclusivo/final exclusivo. Falta costo/piso/margen es NotEvaluable, jamás costo0 implícito.
4. LegacyPreserved conserva exactamente first-match del array anterior y la semántica OwnBase/LegacySurcharge SC17B. Las fechas legacy válidas `YYYY-MM-DD` son días BA inclusivos: from→00:00−03:00; until→00:00−03:00 del día siguiente, límite exclusivo. Se conserva además el predicado histórico original para valores legacy inválidos/edge: comparación lexicográfica `from<=díaBA<=until` en orden original, sin saltar al segundo si el primer match produce precio null. Ese precio queda no disponible, no se cambia por base/otra oferta. No se inventa timestamp para fechas no interpretables. Vectores: from=until=15/10 aplica todo15BA y no16BA; dos matches10%/20% aplica10%; primer match percent inválido+segundo20% devuelve no disponible; fecha legacy no calendario pero predicado histórico verdadero conserva resultado de compatibilidad y se advierte que no es política evaluada. Por presentación: OwnBase descuenta su base; LegacySurcharge descuenta baseSKU y suma extra después, igualSC17B. No se inventan piso/costo/margen. Sólo permite pausar; pausa Legacy es irreversible mediante reactivación directa. «Completar elegibilidad» crea borrador Policy independiente con campos explícitos y confirmación de reemplazo. Si no existe nueva ganadora evaluada/activa, funciona el fallback legacy en orden original. CampaignSC19 no altera ese registro de compatibilidad.
5. GO del padre: referencia Demo compartida y congelada **2026-10-15T12:00:00-03:00**, zona **America/Argentina/Buenos_Aires**, persistida en snapshotv6 y expuesta por puerto de reloj. Todas las rutas, preview/current, cart y checkout consumen exactamente ese instante. Reload no recaptura Date/fecha real. UI dice «Fecha de simulación:15/10/2026 12:00 (Buenos Aires)». No hay botón de adelantar fecha ni reloj vivo implícito. La fecha histórica de creación de un pedido sigue siendo un hecho separado, nunca fecha de acreditación inventada.
6. Editor crea borrador. Editar una habilitada crea revisión separada; no reemplaza oferta aplicada hasta confirmar commit. Guardar Draft/Scheduled no afirma precio actualizado. Preview muestra por presentación precio actual tienda, proyectado, elegibilidad/motivo, ganadora y fuente; precio base/lista/Outlet no se sobreescribe. Piso/margen se evalúan por presentación y ámbito explícito SKU o presentación; variantes arbitrarias y stock independiente siguen fuera.
7. Comandos revalidan rol/contexto/módulo exacto, actor/epoch y fingerprint dentro de state.run; CAS/readback y rollback existentes. Targetstate idempotente, repetición no agrega revisión/efectos. Cuota/conflicto conservan buffer; logout/cambioactor/destrucción bloquean submit y borran privado. Ningún cambio en stock/reservas/listings/syncJobs/históricos.
8. Listado profesional con búsqueda, filtros cerrados, URL/back/reload, conteos/paginación, vacío real vs no-results, error/Unknown accesibles. Seis mocks enumerados abajo; escenarios Unknown/empates/archivado se aíslan en fixtures de prueba, no reemplazan seed. Clock/legacy fuente/estado/elegibilidad/ganadora siempre distinguibles. El legado10% deDEMO001 conserva precio actual.
9. Editor/preview/confirm/discard nativos, errores por campo, foco coherente, Escape/trap/restore, dirty guard y beforeunload. Cinco anchos320/390/768/900/1440, text2x real/rects sin solape, dinero indivisible y Axe sin excepciones inventadas.

## Plan ejecutable y evidencia requerida

Excepción LegacyPreserved GO: conserva también el clamp histórico `max(1, amount)`: base1centavo/50% y100% devuelven1centavo. Las políticas nuevas no heredan ese clamp: resultado<=0 se rechaza.

Checkpoint dominio21:18:52UTC: tipos/clock/record/codec/migración, eligibility/rank/quote BigInt, draft/commit/authority y snapshotv6 integrados; focal24/24 PASS (12SC18+12SC17B). Primer focalSC18 11/12 falló porque comparaba seed no normalizado con decoder que agrega campos opcionales históricos; fixture normalizado y roundtrip deep-equal se mantiene. UI/owner/verify/full aún pendientes, no se declaran verdes.

### Seis mocks nuevos y efecto en fecha de simulación

- OFF-DEMO-001, DEMO001: Enabled/Scheduled20%, inicia16/10/2026; proyecta descuento pero no cambia el actual heredado10%. Piso/costo/margen explícitos completos.
- OFF-DEMO-002, DEMO002: Draft15%, costo/piso/margen ausentes explícitos; NotEvaluable y sin efecto.
- OFF-DEMO-003, DEMO010: Enabled/Active10%, ventana01/10–01/11, inputs completos; ganadora única de suSKU, precio actual derivado. No tocaDEMO001 ni históricos.
- OFF-DEMO-004, DEMO004: Paused5%, inputs completos, sin efecto; Standard y Case conservan bases/preciosSC17B.
- OFF-DEMO-005, DEMO006: Enabled/Expired5%, venció14/10; producto agotado se identifica sin invalidar existencia del catálogo; sin efecto actual.
- OFF-DEMO-006, DEMO003: Enabled/Invalid por ventana invertida; lectura segura, sin efecto; edición requiere corregir intervalo.

Fixtures adicionales (no mutan el seed aprobado): activationUnknown→lifecycleUnknown; dos/tres Active con empate en prioridad/bps/start para Winner/Superseded porID; producto archivado→scopeRejected; stock0 separado de elegibilidad de precio; overflow y margen/piso rechazados.

### Confirmación y revisión

Reemplazo programado (corrección P2 de dominio): habilitar una revisión Scheduled conserva `revisionOf`+revisión esperada y no pausa la fuente original antes del inicio. Estado cerrado de reemplazo Pending/Effective/Blocked. Al inicio, la cotización deriva la sustitución atómica sin escribir al leer: una revisión habilitada y evaluable suprime la fuente original, no suma descuentos; al vencer no revive la fuente reemplazada. Si sus inputs se vuelven no evaluables/stale, la sustitución queda bloqueada para reconciliación y no pausa ciegamente la fuente previa. Una pausa después de sustitución efectiva consolida la pausa de la fuente reemplazada en el mismo comando, nunca auto-write. SKU de una revisión es inmutable; para otro SKU se crea una oferta nueva. Scope de presentación sí puede cambiar con preview completo.

Confirmar habilitación/reemplazo/pausa muestra por presentación fuente y precio **antes→después**, instante simulado y momento de efecto: Scheduled conserva actual hasta inicio; Draft no aplica; Active cambia sólo tras commit durable. Pausar Legacy avisa que no hay reactivación directa y muestra base/fuente sustituta, no promete restaurar necesariamente base si otra nueva ganadora válida existe. Editar activa guarda draft revisión sin tocar fuente actual; sólo confirmación explícita aplica la nueva y pausa/sustituye la anterior. Cancel/Escape no escribe ni muestra éxito.

SDD→tipos/codec/clock/money→migración/policies/commands→cotización única→UI dedicada+revisión/guard→seed explícito→unit/component→owner/CTA→verify/buildDemo/full→dos reviews finales y exactSHA. No reusar writer dirty ni la UI monolítica compartida SC18/SC19.

Regresiones: migración/dobledecode/legacyfirst-match+Case; fechas offset/BA/límites/leap inválido; MAX_SAFE, bps fraccionales/NaN y productos BigInt; piso/margen faltante/rechazado; ties completos; no stacking/campaignrepricing; draft/programada/pausa/revisiónconfirmada; snapshot byteexact en lectura/cancel/reload; autoridad+Unknown+moduleduplicate; CAS/quota/dos pestañas/epoch/destrucción; card/PDP/cart/checkout quoteigual y pedido previo inmutable. CTA completo, no forceclick ni recorte de assertions.

## Checkpoint local de integración (sin cierre)

Verify 21:52:03 UTC PASS: boundary 6/6, scan arquitectura, lint, Angular 638/638 en 98 archivos y build Real. Focal SC18 22/22 PASS 21:50:26 UTC. Build Demo anterior PASS; se reconstruye tras la regresión adicional de migración de scope/boundary legacy no comercial.

Owner inicial: 8/11 por selector SKU ambiguo; luego 10/11, cuyo fallo intentaba hacer clic en logout del shell detrás de un diálogo nativo modal (el bloqueo de fondo es correcto). Se sustituyó por descarte explícito + logout real, manteniendo prueba de epoch con buffer vivo en componente. Owner original final 11/11 PASS; se agregaron tres adversariales de empate estable, CAS durable y vacío vs persistencia corrupta, todavía pendientes de esta ejecución final.

Regresiones de ofertas anteriores se adaptaron al nuevo contrato: borrador + límites explícitos + habilitación confirmada, no mutación de campañas SC19. Dos tests de precio/reset y orden de catálogo PASS. Primer intento de esas adaptaciones falló por un CTA anterior remanente y lectura prematura de la fila antes de completar navegación; ambas expectativas ahora esperan render real, sin force click ni quitar asserts.

Primer CTA completo 17/19 PASS: el nuevo escenario usó `invalid` para probar un filtro no reconocido, pero es el wire válido del lifecycle Invalid. Ahora usa un valor fuera del conjunto. El segundo fallo fue el afterAll del inventario por el escenario anterior abortado y reinicio de worker, no un fallo funcional SC26. Se conserva la verificación global de todos los CTAs estáticos y observados. CTA y full Demo aún no se declaran verdes.

Hardening adicional de migración: un SKU legacy imposible de casar con un SKU canónico no rechaza todo un v5; usa scope no comercial sin truncarlo hacia un producto existente. Un límite inicial legacy no-string no se traduce a cadena vacía (que podría activar antes una regla inelegible), sino a límite no coincidente. Campañas originales permanecen byte-exact y el roundtrip v5→v6→v6 se prueba.

## Cierre local y trazabilidad

### Hardening final de coherencia de compatibilidad

Full anterior 184/184 PASS13min sobre build22:07:08, antes del último hardening; no se atribuye al decoder posterior. LegacyPreserved ahora exige correlación exacta entre `discountBps` mostrado y `legacy.percent` usado para cotizar (incluido null). También exige ámbito SKU legacy, sin revisión Legacy artificial, y coherencia entre intervalo mostrado y la traducción de los límites preservados; offsets equivalentes se aceptan por instante, no por texto. No cambia ningún registro canónico ni efecto migrado. Dos regresiones nuevas cubren porcentajes contradictorios, scope/intervalo alterados y offset equivalente.

Checkpoint antes del full: verify post-hardening final PASS640/640 en98archivos, boundary6/scan/lint/buildReal22:23:17 UTC. BuildDemo22:24:12 PASS. Fuente producto congelada. Full final184 con `--workers=2` entonces en curso: mismos17archivos y mismos184escenarios, cada archivo serial por configuración y collector CTA intacto; no exclusiones ni retries. Resultado cerrado en la sección siguiente.

### Gates del cierre anterior — históricos, previos al REQUEST_CHANGES

- `npm run verify`: PASS640/640 en98archivos, lint, boundary6/6, scan arquitectura y build Real. Finalizado22:23:17 UTC.
- `npm run build:demo`: PASS22:24:12 UTC; mismo build usado por la ejecución final.
- Focal Ofertas+Overview: `ng test --watch=false --include src/app/demo/offers/*.spec.ts --include src/app/demo/overview/*.spec.ts`: PASS36/36 en4archivos,22:26:12 UTC.
- Full final: `playwright test -c playwright.demo.config.ts --workers=2`: PASS184/184 en17archivos,4.7min. Reporte `frontend/demo-playwright-report/results.json`: startTime2026-10-28T22:24:30.203Z, duration279379.712ms, expected184, skipped0, unexpected0, flaky0. `.last-run.json`: passed/failedTests[]. No grep, exclusiones, retries ni relajación del inventario.
- Dentro del full: owner SC18 14/14 y CTA19/19, además de las regresiones anteriores de catálogo/checkout/resultado/historial/posventa/persistencia. Las pruebas de epoch/destrucción inmediatas con buffer vivo siguen en componente; el navegador verifica descarte explícito+logout real y cambio de permisos/lease, sin clic forzado a través de un modal.
- Capturas finales `frontend/test-results/offers-sc18-SC18-responsiv-*/`: lista/editor/preview320/390/768/900/1440 y text200% real con medidas internas de dinero. Inspección autor de preview320/editor1440/text2x1440 realizada; no equivale a aprobación UX independiente.
- `git diff --check`: PASS. Sin commit/push. Servidor de pruebas4390 finalizado por Playwright; comprobación posterior sin listener. No se detuvieron servidores ajenos.

No se declaran reviews independientes aprobadas sobre esta fuente ni SHA final: quedan para el padre tras este handoff. La prioridad visual Stitch R7 del reviewer UX fue respetada. No se inició SC19.

Checkpoint 22:07 UTC: owner SC18 ampliado 14/14 PASS; CTA completo final 19/19 PASS con inventario estático y observado sin pendientes. Dos iteraciones adicionales del CTA habían detectado controles habilitados no ejecutados tras consultar DOM prematuramente; ahora el recorrido usa Activation/Source cerrados y espera el control opuesto realmente visible después de cada confirmación, no `count()` oportunista. El collector y sus assertions globales siguen intactos.

OverviewAction.Offers se alineó con autoridad SC18 Admin+Operator; sólo ese atajo se habilitó para Operator, sin inventario/ML/settings adicionales. Verify final 638/638 + boundary6/scan/lint/build Real PASS22:04:39 UTC. Focal Offers+Overview 34/34 PASS22:05:25; browser Operator entrada natural+allowlist2/2 PASS. La allowlist previa del owner SC15 se actualizó únicamente con la ruta autorizada Offers y un assert de CTA visible. Primer full184 fue interrumpido temprano tras14PASS (sin fallo) al detectar ese fixture anterior, no se certifica. Full184 reiniciado con buildDemo22:07:08; todavía en curso y no se declara PASS.

### Límites y rollback

Demo frontend exclusivamente. Sin publicación externa, mensajes, provider, backend ni homologación. v6 no es legible por build<=v5: rollback requiere raw original anterior a primera escritura o build compatible; no borrar ofertas/hechos históricos para simular downgrade. No se crea backup automático. SC19, Real, Stitch global/CI/promoción y TASK-014 general siguen pendientes.
