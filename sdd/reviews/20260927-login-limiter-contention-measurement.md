# TASK-LRB-005 — medición local del limiter

Estado: evidencia de diagnóstico local; no es review independiente ni autorización de merge. El objeto medido es `LoginRateLimiter` directamente, sin HTTP, hash de contraseñas, PostgreSQL ni red. Las claves y cargas son sintéticas: no se dispone aquí de una distribución de tráfico real. Ningún resultado constituye un SLO de producción.

## Protocolo reproducible

- Base de la rama: `744f7f524037a2c9ea4a89d5fcc1cc9fb333679b` sobre `integration/storecore-int` `ab817891abb6c7b710bca809804d924401ed74f0`. El benchmark y esta evidencia son cambios posteriores a esa base; el hash final del PR debe registrarse al publicarlos. SHA-256 del harness medido: `2A8C9533EBF868061037B847BB23CD04D188609F51B2EA4850A6C92E3015E979`; SHA-256 del limiter productivo: `C22DF5FB40751D0BF5868C069CE52F98CD8DBE3C112A74F5CD21D39E285D3234`.
- Host: Windows 10 amd64; Intel Core i7-12700F, 12 núcleos físicos y 20 lógicos; 42 750 226 432 bytes de RAM.
- JVM efectiva en el proceso de pruebas: Microsoft OpenJDK 21.0.8; `java.vm.name=OpenJDK 64-Bit Server VM`; sin argumentos JVM adicionales; `availableProcessors=20`; `maxMemory=10 695 475 200` bytes. Maven 3.9.2. El `java -version` del PATH informa 21.0.12.1, distinto de la JVM que Maven usa; la versión efectiva consta en cada CSV.
- Tres procesos Maven/JVM independientes para cada configuración de 1, 8 y 32 workers. Cada escenario hace 5 s de warmup y 10 s de medición, con los buckets preparados antes y reloj fijo. Las latencias se miden con `System.nanoTime()`; cada worker guarda un reservorio uniforme de hasta 2048 muestras, sin introducir un lock de muestras compartido. Los percentiles estimados ponderan cada reservorio por `completed/sampleCount`; no son percentiles exactos ni modelan esperas bajo una tasa externa de llegadas.
- Los CSV incluyen por escenario/lane operaciones completadas, aceptadas/rechazadas, errores, timeouts/fallos de worker, duración, throughput, p50/p95/p99, máximo y tamaño de muestra. El máximo considera todas las operaciones, no sólo el reservorio. Cada fase de warmup/medición (incluida JFR) escribe su salud; un error, timeout, fallo de barrera o terminación incompleta hace fallar el test después de persistir evidencia diagnóstica, sin leer muestras de workers vivos.

Comando por combinación `workers`/`repeat`, ejecutado desde `backend`:

```powershell
mvn -q '-Dtest=LoginRateLimiterContentionBenchmark' '-Dlimiter.bench=true' '-Dlimiter.bench.workers=<1|8|32>' '-Dlimiter.bench.repeat=<1|2|3>' '-Dlimiter.bench.commit=744f7f524037a2c9ea4a89d5fcc1cc9fb333679b' '-Dlimiter.bench.output=target/limiter-bench/final-w<workers>-r<repeat>.csv' test
```

Los escenarios son `existing_four`, `existing_five`, `miss_1000`, `miss_9999`, `miss_10000`, `churn_near_capacity` (lanes `clear` y `record`), `cross_user_customer_existing`, `cross_user_customer_misses` y `cross_customer_user_misses`. En las comparaciones cruzadas hay un worker primario y los restantes trabajan en el otro realm. Con un solo worker no hay background; esa fila sirve de referencia, no de comparación de interferencia.

## Atribución JFR separada

La primera pasada JFR exploratoria, anterior al fix de warmup de la propia instancia, registró 7291 eventos del monitor `LoginRateLimiter` y 93 063 307 600 ns de espera acumulada entre hilos. Su stack identifica `checkAllowed`, pero **se conserva sólo como diagnóstico invalidado**, no como resultado final: esa instancia no recibió warmup antes de grabarse. Artefacto local `backend/target/limiter-bench/jfr-w32.jfr`, SHA-256 `286052AA6AEBEEDEAF4C2CDFC5D9512D3B8EA2F7FF9A6968D52E4EA318572861`.

La pasada final, separada de la serie de throughput, ejecutó 32 workers sobre `cross_user_customer_misses`, 1 s de warmup y 3 s de medición antes de JFR, y repitió warmup de la **misma instancia** antes de grabar 3 s con `jdk.JavaMonitorEnter` umbral 0 ms y stacks. Comando: el mismo de arriba con `-Dlimiter.bench.scenario=cross_user_customer_misses -Dlimiter.bench.workers=32 -Dlimiter.bench.warmupSeconds=1 -Dlimiter.bench.measureSeconds=3 -Dlimiter.bench.jfr=true -Dlimiter.bench.output=target/limiter-bench/final-jfr-w32.csv`. Las cuatro fases reportan cero errores/timeouts/fallos y terminación completa. JFR registró **5843** eventos del monitor `LoginRateLimiter`, **93 077 299 200 ns** de espera acumulada entre hilos; sus stacks atribuyen 5663+180 eventos a `LoginRateLimiter.checkAllowed`. La suma entre 32 hilos puede superar los 3 s de pared. Grabación local `backend/target/limiter-bench/final-jfr-w32.jfr`, SHA-256 `7B48CAC3B6658085D083FAB3301128E453C12A12B2A70DC36AC7E5320FAB3AE4`; CSV de fases `final-jfr-w32.csv` y eventos `final-jfr-w32-monitor.csv` permanecen locales. JFR agrega overhead: sus latencias no son comparables con la serie principal.

## Resultados y decisión

La primera serie completa (`w*-r*.csv`) usó percentiles sin ponderar entre workers; la segunda (`v2-w*-r*.csv`) fue interrumpida durante la primera corrida de 32 workers tras el NO-GO metodológico Astra. Ambas quedan como exploratorias/inválidas y **no** forman parte del resultado final.

La serie final completa está adjunta en `sdd/reviews/20260927-login-limiter-raw/final-w<1|8|32>-r<1|2|3>.csv`: nueve procesos JVM independientes, 162 fases warmup/medición, 10 filas por corrida de 1 worker y 13 por corrida de 8/32. Todas las fases indican `error_calls=0`, `worker_timeouts=0`, `worker_failures=0`, `terminated=true`, `exception=none`; todas las filas tienen cero errores/timeouts/fallos. El runner de parches normalizó CRLF a LF en la copia revisable; la comparación de líneas con los nueve archivos generados no tiene diferencias.

Medianas de tres corridas independientes (throughput en operaciones/s; p95 estimado por reservorios ponderados, en μs):

| Escenario / lane | 1 worker | 8 workers | 32 workers |
|---|---:|---:|---:|
| `existing_four` / user | 136 559; p95 8,6 | 102 806; p95 13,4 | 101 359; p95 12,4 |
| `miss_1000` / customer | 90 379; p95 12,8 | 75 303; p95 16,5 | 76 795; p95 15,3 |
| `miss_9999` / customer | 15 308; p95 80,5 | 14 017; p95 84,1 | 13 857; p95 85,6 |
| `miss_10000` / customer | 7 412; p95 185,1 | 7 200; p95 166,3 | 6 938; p95 167,9 |
| `cross_user_customer_misses` / primary | 135 933; p95 8,6 | 3 093; p95 11,9 | 447; p95 10,3 |
| `cross_user_customer_misses` / background | — | 7 394; p95 155,8 | 7 173; p95 181,8 |

Los CSV contienen también `existing_five`, `churn_near_capacity`, `cross_user_customer_existing`, `cross_customer_user_misses`, p50/p99, máximos, rangos entre corridas y aceptación/rechazo. La lane `primary` tiene un worker, pero con 8/32 workers compite con background; **no** es una comparación aislada de escalabilidad. En `cross_user_customer_misses` de 32 workers, `primary` osciló entre 371 y 1017 operaciones/s y registró máximos individuales de **1,73–1,96 s**, pese a p95 estimado de 10–11 μs; el muestreo y una cola extrema no deben resumirse sólo con p95. La caída de throughput y JFR respaldan una hipótesis de interferencia por monitor global; no prueban rendimiento bajo tráfico real ni un SLO. No hay umbral de producto fijado para declarar PASS/FAIL de rendimiento.

**Propuesta posterior, no implementada:** guardar por bucket sólo los cinco fallos recientes. Con reloj no decreciente y timestamps en orden de inserción, todos los fallos más antiguos que ese sufijo son también anteriores a los cinco conservados; por lo tanto, si los cinco conservados expiraron, los anteriores también. Si hay ≥5 vigentes, el índice `n-5` del deque completo es el primero de los últimos cinco y produce el mismo desbloqueo. El vencimiento de capacidad usa el último fallo, también conservado. La prueba requiere modelar seis o más fallos intercalados, expiración de los más antiguos, rewind de reloj (fuera de la equivalencia o mediante clamp explícito) y límite de memoria por bucket. La partición de locks/snapshot y el barrido `pruneExpiredBuckets` hasta 10 000 buckets requieren diseño y medición separados: JFR apunta al monitor de `checkAllowed`, pero no descompone su costo interno. No implementar ninguna optimización sin nuevo corte SDD, review y GO; el hardening principal sigue siendo process-local, contencioso y sin SLO productivo.
