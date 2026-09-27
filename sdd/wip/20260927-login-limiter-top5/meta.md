# Meta — cota de cinco fallos por bucket de login

- Feature id: 20260927-login-limiter-top5
- Estado: building (código y pruebas locales con GO de Astra A/B; PR pendiente)
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
| Implementation | in_progress |

Dos revisiones Astra independientes dieron GO documental; el expediente está en sdd/reviews/20260927-login-limiter-top5-astra-documentary-go.md. La observación editorial P3 de Astra A sobre cardinalidad quedó corregida en el spec técnico y TASK-LT5-003. La implementación local partió de integration/storecore-int 73367fa, pasó 29 suites/129 pruebas sin fallos, errores ni skips, y obtuvo dos GO de Astra sobre el snapshot final tras corregir el P3 de conteos exactos. La evidencia está en sdd/reviews/20260927-login-top5-local-dual-code-go.md. TASK-LT5-001–004 están done a nivel local; TASK-LT5-005 sigue pending hasta crear y fusionar el PR hacia integración. No hay CI alojado verde, promoción a master, release ni sdd.finish declarados.
