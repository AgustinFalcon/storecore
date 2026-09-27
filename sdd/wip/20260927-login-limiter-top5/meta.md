# Meta — cota de cinco fallos por bucket de login

- Feature id: 20260927-login-limiter-top5
- Estado: ready_for_implementation (GO documental Astra A/B; código pendiente)
- Tipo: delta acotado del backend Kotlin/Spring Boot
- Base de redacción: origin/integration/storecore-int 56baa2db2d6fabbd683ce41459414c556cb5246d (2026-09-27)
- Contrato precedente: sdd/wip/20260927-login-realm-budget/, TASK-LRB-005
- Evidencia precedente: sdd/reviews/20260927-login-limiter-contention-measurement.md y nueve CSV en sdd/reviews/20260927-login-limiter-raw/

## Propósito y límite

Acotar a cinco timestamps lógicos la memoria de fallos de cada bucket USER/CUSTOMER, conservando las decisiones del limitador actual. El antecedente TASK-LRB-005 midió contención y propuso esta cota, pero no la implementó. Este corte define sólo esa cota y una política explícita para retrocesos del reloj. No particiona el monitor, no cambia el barrido O(n), no agrega presupuesto distribuido ni altera el número máximo de buckets.

No requiere migración, base de datos, proveedor externo, Mercado Libre, BlackStore ni POS. El contrato HTTP de login y la separación USER/CUSTOMER permanecen vigentes. El WIP precedente continúa abierto hasta sus propios gates de CI y sdd.finish; este documento no los sustituye.

## Gates

| Fase | Estado |
|---|---|
| Functional Spec | ready_for_implementation |
| Technical Spec | ready_for_implementation |
| Tasks | ready_for_implementation |
| Implementation | not_started |

Dos revisiones Astra independientes dieron GO documental; el expediente está en sdd/reviews/20260927-login-limiter-top5-astra-documentary-go.md. La observación editorial P3 de Astra A sobre cardinalidad quedó corregida en el spec técnico y TASK-LT5-003. La simulación de referencia informada por Astra B valida el diseño, no una implementación de StoreCore. TASK-LT5-001 está done y habilita TASK-LT5-002/003. Antes de código se debe volver a comprobar el HEAD de integración: avanzó por PR #53 desde la base 56baa2d de esta redacción. Después se exigen pruebas locales y dos reviews independientes del diff final. El CI alojado del WIP precedente no se declara verde: sus jobs fallaron con steps=[]. No hay aprobación de código, PR, merge, release ni sdd.finish en este corte.
