# TASK-LRB-005 — review adversarial del arnés de medición

**Fecha:** 2026-09-27
**Veredicto:** NO-GO para cerrar TASK-LRB-005 sobre el primer arnés. No modifica los GO anteriores de login ni aprueba el PR #50 tras cambios nuevos.

Hallazgos P2:

1. `PhaseResult.asCsv` concatenaba igual cantidad de muestras por worker. Bajo contención los workers completan volúmenes muy distintos, por lo que p50/p95/p99 quedaban ponderados por worker, no por operación. Exige peso `completed/sampleCount` por reservorio o histograma combinable; repetir corridas, ya que los CSV previos no guardan reservorios.
2. `measure` fallaba sólo por timeout/fallo de worker. Errores de operación o aceptación/rechazo inesperados podían dar test verde; warmup no publicaba salud. Exige fases explícitas y cero errores en warmup, medición y JFR.
3. Barrera/terminación podían lanzar antes de persistir evidencia; `Future.get` tenía un timeout completo por worker. Exige plazo global, registro de fase incompleta y no leer muestras de workers todavía activos.

Ajustes adicionales: calentar la **misma instancia** del escenario JFR antes de grabar; rechazar nombres desconocidos; no presentar la serie `v2` interrumpida como completa. Las latencias de este ensayo de carga cerrada no representan la espera ante llegadas externas a tasa fija.

El revisor no encontró P0/P1 ni objeción a la prueba conceptual top-5 bajo reloj no decreciente. Las correcciones se aplicaron al arnés y deberán recibir nueva revisión sobre los CSV definitivos antes de cerrar TASK-LRB-005. No se implementan cambios al limiter productivo en este corte.
