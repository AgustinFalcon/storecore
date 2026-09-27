# Astra — TASK-LRB-005, medición y propuesta

**Fecha:** 2026-09-27. **Veredicto:** GO para marcar TASK-LRB-005 `done`; no es aprobación del PR #50 ni de una optimización.

La revisión independiente cotejó los nueve CSV crudos con los originales: 162 fases sanas, 108 filas y 50 424 660 operaciones, sin errores, timeouts, fallos ni lanes vacías. Las medianas, duraciones y orden de percentiles coinciden con la evidencia; también coinciden los SHA-256 del harness, limiter y grabación JFR. En el binario JFR hay 5843 eventos del monitor `LoginRateLimiter` y 93 077 299 200 ns de espera agregada en `checkAllowed`; el evento adicional pertenece a `PlatformRecorder`.

La propuesta top-5 preserva la semántica sólo bajo tiempos no decrecientes y **no está implementada**. El resultado expone contención y máximos cercanos a dos segundos; no declara aislamiento de rendimiento, distribución ni SLO productivo. Sin P0/P1/P2 dentro del alcance de medición/propuesta. El diff final del PR requiere dos reviews independientes antes de merge a integración.
