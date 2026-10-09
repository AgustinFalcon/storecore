# FE-COMP-06 — canal marketplace y competencia de muestra

Fecha 2026-10-09. Base C04 `78289ce`; rama `integration/storecore-comp06-marketplace-competition`. Código final `ac1c90bc95f99594b5dd9f043ef584a5824e1a9b`. Estado: `implemented_local_pending_independent_review_and_ci`. Sin push, PR, merge ni activación de proveedores.

E06.1: cuenta cerrada Desconectada/Autorizada simulada/Vencida/Error/Pausada/Unknown, fecha de actividad y acciones de recuperación. Mapping explícito SKU/variante local → publicación/variación `SIM-` permite crear, editar y desvincular sin inferir por nombre. Conflictos de identidad bloquean ventas/procesamiento; duplicados persistidos se traducen a Conflict. Unknown bloquea comandos. Cuenta y vínculos del panel anterior leen las proyecciones de este dominio; se retiró el antiguo método que podía asignar observado sin respuesta.

E06.2: por variante se conservan disponible local (sin reservas), deseado/fecha, observado/fecha y confirmado/fecha. Proyección conserva deuda con cuenta pausada/vencida/error. Generaciones reemplazan intenciones anteriores; un fallo conserva observado/confirmado, registra intento y error, y reintento exitoso converge. Nueva venta genera una operación; repetir el último evento no duplica decremento, incluyendo operaciones sin saldo disponible posterior. Se bloquea operación reutilizada para otra variante. Reservas web y su cancelación cambian disponibilidad/deseado sin consumir venta, y la compra conserva idempotencia previa. El resumen legacy corresponde a la variante principal; el detalle por variante es la fuente de comparación.

E06.3: watchlist mantiene producto/variante comparable, fuente fixture local de solo lectura, umbral, precio, fecha e historial de observaciones/operaciones. Fuente reciente/vieja/no disponible es un tipo cerrado. Controles simulan vencimiento, indisponibilidad, refresco, cambio y replay; replay no duplica observación/alerta. La comparación muestra diferencia porcentual frente al precio propio y no lo modifica. Leer señales no las resuelve; alertas permanecen activas en inbox y mantienen identidad estable. Marcar alertas de competencia leídas actualiza también lectura admin del inbox, preservando resolución independiente.

Snapshot v5 migra v1-v4. El stock agregado legacy nunca se convierte en una confirmación/observación inventada de la variante principal. Mappings, jobs, cantidades, fechas, identidades de variante y observaciones pasan por el traductor de persistencia; v5 sin marketplace se rechaza con recuperación explícita. No hay llamadas externas, OAuth, scraping, cambios de precio remoto ni pruebas de homologación.

## Evidencia ejecutada

- Unit final en `ac1c90b`: 78 suites, 356/356 PASS; incluye 12 pruebas nuevas de Unknown/migración/corrupción, mapping/conflicto, reservas/cancelación, deuda/pausa/error/retry, stock/exact-once, frescura/umbral y lectura/resolución.
- Lint PASS y check:architecture PASS (6 pruebas de frontera más scan).
- Build demo final en `ac1c90b` PASS, 2.37 MB desarrollo. Validación usa `subst V:` y `--preserve-symlinks` por restricción de lectura ancestral del entorno.
- Regresión browser full 48/48 PASS, 3.7 minutos. Reporte local ignorado `frontend/demo-playwright-report/full-c06-48.json`. Después del build de esa corrida se cerraron únicamente deltas de etiqueta/counter de cuenta, lectura competencia→inbox y fecha de actividad. Se revalidó código final con unit/build y 4/4 recorridos C06 PASS (15 segundos).
- Reportes registran baseline CTA 418 ejecutados, C04 23 familias, postventa 13 familias y C06 17 familias, sin pendientes. Son ledgers separados: no se presentan como un total de botones independientes.
- C06 axe cero violaciones y sin overflow en Cuenta/Publicaciones/Stock/Actividad/Competencia × 390/768/1440; screenshots locales en `frontend/test-results/marketplace-completion-com-057d1-s-responsive-and-accessible/`.
- Browser bloquea cualquier host externo y `/api`; todas las respuestas son locales.
- Runner del puerto 4390 detenido y drive `V:` desmontado; chequeo final sin listener y `subst` vacío.

Fallos anteriores fueron registrados y corregidos: etiqueta accesible de select; ID de variante fixture `with-case`; contraste empty-state; nota demo duplicada que rompía selector; ledger baseline observando los nuevos controles sin su ledger dedicado; carrera de test que leía cantidad antes de renderizar historial. La corrida final anterior y la específica final no tienen fallos.

Residual: review independiente, integración con C05 y validación combinada, CI y PR. Producción HTTP, OAuth/dispatcher ML, fuente competidora autorizada, homologación y proveedores reales siguen fuera de este corte. No hay PASS de producción ni autorización de release en esta evidencia.
