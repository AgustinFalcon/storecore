# Revisión documental Astra A/B — login limiter top 5

Fecha: 2026-09-27. Alcance: sdd/wip/20260927-login-limiter-top5/ redactado desde origin/integration/storecore-int 56baa2db2d6fabbd683ce41459414c556cb5246d. Veredicto: GO documental para iniciar TASK-LT5-002/003; no es GO de código, PR, merge, release ni sdd.finish.

## Dictámenes independientes

- Astra A: GO de contrato, con P3 editorial en la prueba 1 del spec técnico. La frase original "cardinalidad lógica" podía interpretarse como exigir 256 timestamps también en la deque acotada. Se corrigieron technical/spec.md y TASK-LT5-003: después de la misma poda deben coincidir las claves/buckets activos por realm; la deque acotada debe igualar el sufijo de hasta cinco timestamps de la referencia y tener tamaño min(5, tamaño de referencia). Functional AC-01/02 mantiene cota interna y equivalencia observable sin contradicción.
- Astra B: GO documental sin P0–P3. Confirmó una simulación independiente del modelo de referencia de 200 000 operaciones con seed 137047, cubriendo equivalencia del diseño; esa simulación no ejecuta el código futuro de StoreCore.

Los dos dictámenes cubren el diseño de reloj efectivo no decreciente, el cálculo n - 5, Retry-After por umbral/capacidad, clear, llamadas directas a recordFailure, 6/32/256 fallos y los límites expresos del corte. La simulación de Astra B no reemplaza TASK-LT5-003 ni las pruebas HTTP/locales del código implementado.

## Límites del GO

TASK-LT5-001 se marca done y el WIP pasa a ready_for_implementation. TASK-LT5-002–005 siguen pending. Antes de implementar se revalida el HEAD de integración porque avanzó por PR #53 desde 56baa2d. Se requieren dos reviews independientes del diff final y pruebas locales. El CI alojado del WIP precedente había fallado con steps=[]; no se afirma CI verde.
