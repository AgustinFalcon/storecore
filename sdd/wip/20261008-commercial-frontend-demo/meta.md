# StoreCore — demo comercial integral del frontend

- Estado: `documented_for_review`; implementación y aceptación `NOT_RUN`.
- Base inmutable: `ef21e612d13a2b104dd7c96fb1f97ae4e7ca8ce2` (#182 documental, incorpora #181 frontend UA).
- Prioridad del usuario 2026-10-08: completar diseño, pantallas y todos los botones para presentación; comportamiento local simulado permitido antes del backend.
- Este corte no incluye el candidato backend FE04 no publicado. Sus gates de producción continúan en [INT-FE](../20261008-integration-frontend-process/meta.md).
- Demo y producción comparten componentes y contratos; una composición explícita elige adaptadores. DEMO no acredita integración real ni homologación.
- Rama documental: `sdd/storecore-commercial-demo-frontend`.

Leer [funcional](1-functional/spec.md), [inventario verificable](1-functional/route-cta-inventory.json), [técnico](2-technical/spec.md), [plan](3-tasks/plan.md), [DAG](3-tasks/tasks.json) y [evidencia](4-implementation/progress.md).

Este contrato complementa el sistema visual existente y sustituye, para la presentación frontend, la dependencia temporal de FE04 backend. No declara terminado INT-FE ni cambia autorización de master/release. La revisión independiente usará GPT-6.1 Sol según instrucción vigente del usuario.
