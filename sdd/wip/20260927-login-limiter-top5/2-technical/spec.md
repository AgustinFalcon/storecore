# Technical spec — historial acotado del limitador

Estado: ready_for_implementation. GO documental Astra A/B en sdd/reviews/20260927-login-limiter-top5-astra-documentary-go.md. Alcance: LoginRateLimiter process-local y sus pruebas.

## Modelo de referencia y equivalencia

El modelo de referencia usa el mismo key realm|sourceIp|SHA-256(canonicalEmail), la misma capacidad por realm, el mismo monitor, la misma ventana móvil de 900 000 ms y un deque de todos los fallos no podados. Las operaciones se linealizan en el orden en que adquieren el monitor; checkAllowed y recordFailure siguen siendo operaciones distintas. Ambos modelos calculan effectiveNow = max(wallNow, lastObservedMillis) y actualizan el watermark bajo el monitor al comenzar checkAllowed o recordFailure. clear no lee el reloj y no reinicia el watermark. El valor inicial del watermark es el primer wallNow observado, sin centinela que confunda Long.MIN_VALUE con ausencia.

Tras podar timestamps con effectiveNow - t >= window, el modelo acotado retiene el sufijo cronológico de longitud min(5, n): al insertar un fallo nuevo, elimina del frente hasta que queden menos de cinco y agrega el tiempo efectivo. El recorte ocurre dentro del monitor y se aplica también a recordFailure directo, sin depender de un checkAllowed anterior. Nunca se retira un bucket por superar cinco; se retira sólo por clear o porque ya no conserva fallos vigentes. El camino de bucket nuevo respeta el cupo existente y no crea uno si el realm está lleno.

Invariante: con tiempo efectivo no decreciente, los timestamps se insertan en orden no decreciente. Los descartados son siempre anteriores o iguales a los retenidos. Si los cinco retenidos expiraron, todo el prefijo descartado también expiró. Si existen n >= 5 fallos vigentes en la referencia, el más antiguo de su sufijo de cinco es el índice n - 5; ambos modelos calculan el mismo desbloqueo. Si hay menos de cinco vigentes, ninguno de esos fallos se perdió: si alguna vez hubo seis, el sufijo que queda por caducidad se reduce en el mismo orden. El último fallo permanece idéntico, por lo que el vencimiento de cada bucket y el mínimo usado para liberar capacidad son idénticos. Inducción sobre cada operación serializada, incluidos clear, expiración y recordFailure directo, preserva las observaciones.

## Reloj y límites

El reloj de pared puede retroceder. Sin regla adicional, un timestamp antiguo descartado podría volverse vigente y romper la equivalencia. Por eso se adopta el watermark local indicado arriba. Un retroceso no revive fallos; la ventana queda detenida al último tiempo efectivo hasta que el reloj alcance ese valor. Retry-After se calcula con ese tiempo efectivo: durante un rewind prolongado no promete la espera real exacta hasta desbloquear. Reiniciar el proceso reinicia tanto buckets como watermark. Es una decisión de comportamiento nueva y debe probarse explícitamente frente a la referencia con watermark; no comparar el nuevo algoritmo con el viejo comportamiento ante rewind. No se modifica Clock global ni otras partes del sistema.

La cota es de entradas lógicas: 2 realms × 10 000 buckets/realm × 5 timestamps/bucket = 100 000 máximo por instancia, además de metadatos de claves, mapas y buffers internos. No se promete memoria exacta ni mejoras de throughput; el monitor compartido y pruneExpiredBuckets O(n) permanecen. Se debe revalidar el HEAD de integración antes de implementar.

## Pruebas exigidas

1. Modelo de historial completo independiente, con el mismo reloj efectivo; comparar tras cada operación admisión/rechazo y segundos de Retry-After, capacidad y realm. Tras la misma poda, comparar igualdad de claves/buckets activos por realm; para cada bucket, el deque acotado debe ser exactamente el sufijo de hasta cinco timestamps del deque de referencia y su tamaño debe ser min(5, tamaño del deque de referencia), sin exigir igualdad de cantidad de fallos retenidos cuando la referencia tenga más de cinco. Ejecutar secuencias deterministas con 6, 32 y 256 recordFailure para la misma clave, incluyendo llamadas directas y dos checks en vuelo antes de registrar ambos fallos.
2. Fallos escalonados para que el índice n - 5 difiera del primer fallo: comparar expiry - 1 ms, expiry y expiry + 1 ms; comprobar que el header no anuncia una liberación prematura. Cubrir remanente de 1 ms, redondeo hacia arriba y mínimo de 1 segundo en ambos realms.
3. Capacidad con cupo pequeño: dos buckets con primeros y últimos fallos en orden cruzado; comparar Retry-After por último fallo, liberar al expirar el bucket completo, no expulsar activos y no admitir bucket nuevo al saturar.
4. clear intercalado con checkAllowed y recordFailure: limpia sólo la clave y realm correctos, permite nueva admisión y mantiene la independencia USER/CUSTOMER.
5. Reloj mutable con rewind antes y después de podas y recortes, luego avance hasta el watermark y más allá: comparar con referencia, confirmar que el tiempo efectivo no decrece y que ningún fallo descartado reaparece.
6. Verificar por introspección controlada o un seam de prueba que cada deque tiene size <= 5 durante la secuencia, también tras 256 fallos directos; no convertir un contador acumulado en sustituto de la cota real. La suite de login/HTTP existente debe seguir verde.

No se pide benchmark nuevo para esta cota: TASK-LRB-005 sólo motiva la decisión de memoria. Si se reclama mejora de rendimiento, deberá medirse por separado.
