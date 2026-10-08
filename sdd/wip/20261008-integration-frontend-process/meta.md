# INT-FE — frontend productivo sobre integración

- Feature: `20261008-integration-frontend-process`.
- Fecha del inventario: 2026-10-08.
- Estado: `baseline_documented_for_review`; INT-FE-00 documental, INT-FE-01..07 pendientes.
- Base inmutable: `dfaeba0883a1073b185abaf336b63d5d6bdc5d54`, `origin/integration/storecore-int`.
- Rama de preparación: `integration/storecore-frontend-process`.
- Objetivo: completar recorridos web locales y demostrar frontend → Spring → PostgreSQL por cortes revisables.
- UA significa Unified Access, no administración de usuarios. CFE significa commerce closed states and fulfillment eligibility.
- No GO de homologación externa, promoción a master, release, deploy ni `/sdd.finish`.

La antigüedad del encabezado de [STATUS](../../STATUS.md) no reemplaza el inventario de este SHA. La base contiene Flyway V20 y 24 rutas hoja; los textos históricos “V20 libre” y “22 rutas” no son su estado efectivo.

Leer [contrato funcional](1-functional/spec.md), [inventario de rutas](1-functional/route-action-inventory.json), [contrato técnico](2-technical/spec.md), [matriz de trazabilidad](2-technical/traceability.json), [DAG](3-tasks/tasks.json) y [evidencia](4-implementation/progress.md).
