# Functional spec — cota top 5 del limitador de login

Estado: ready_for_implementation. GO documental Astra A/B en sdd/reviews/20260927-login-limiter-top5-astra-documentary-go.md; código pendiente.

## Comportamiento observable

- LT5-AC-01: cada bucket de fallos USER o CUSTOMER conserva como máximo los cinco timestamps lógicos más recientes. Se mantienen los 10 000 buckets máximos por realm; la cota de timestamps lógicos es 50 000 por realm y 100 000 entre ambos, sin prometer bytes exactos de heap.
- LT5-AC-02: con reloj efectivo no decreciente, para cualquier secuencia serializada de checkAllowed, recordFailure y clear, el resultado de admisión, rechazo y Retry-After coincide con un modelo que conserva todo el historial vigente. Incluye recordFailure directo y más de cinco fallos porque solicitudes simultáneas pueden pasar checkAllowed antes de registrarlos.
- LT5-AC-03: el rechazo por cinco fallos vigentes sigue indicando el vencimiento del fallo n - 5 del historial completo ordenado cronológicamente. Se conserva el redondeo positivo del Retry-After, incluso cuando falta 1 ms. Al vencer un fallo antiguo con seis o más vigentes, la clave puede continuar bloqueada.
- LT5-AC-04: la saturación del realm sigue usando el mínimo vencimiento del último fallo de cada bucket activo. Ni el descarte de fallos viejos ni la poda cambian la liberación de capacidad, la separación USER/CUSTOMER o la respuesta pública 429 AUTH_RATE_LIMITED.
- LT5-AC-05: clear elimina sólo el bucket de la clave y realm indicados. Los fallos descartados nunca reaparecen tras clear, expiración o un retroceso del reloj.
- LT5-AC-06: el tiempo efectivo usado por el limitador no retrocede dentro de la instancia: effectiveNow = max(clock.millis(), lastObservedMillis). El watermark se actualiza bajo el mismo monitor que protege los buckets. Mientras el reloj de pared permanece detrás, se usa el último valor observado; cuando lo alcanza, se reanuda el tiempo normal. Las comparaciones de equivalencia usan un modelo de historial completo con la misma regla de reloj. Durante un rewind, Retry-After se refiere al tiempo efectivo y puede no predecir la espera real; no se promete conservar la semántica previa de un reloj que retrocede.
- LT5-AC-07: un fallo vence exactamente cuando effectiveNow - failureTime >= 15 min; a expiry - 1 ms sigue vigente. El Retry-After de umbral y capacidad se redondea hacia arriba a segundos y tiene mínimo 1. No se cambia el contrato HTTP, el hashing de clave ni el orden checkAllowed/verificación/recordFailure.

## Fuera de alcance

Partición de locks, optimización del barrido O(n) entre buckets, rate limiting distribuido, DDL, persistencia, vendors, ML, BlackStore/POS y nuevos SLO. TASK-LRB-005 es evidencia diagnóstica local, no una medición productiva ni una promesa de mejora de latencia por esta cota.
