# StoreCore — demo comercial integral del frontend

- Estado: `documented_for_review`; implementación y aceptación `NOT_RUN`.
- Base inmutable de promoción a `master`: `9a305b940b24d68c6bb80108060996b6210546a5` (#176, unified access endurecido sobre el linaje de `master`).
- Prioridad del usuario 2026-10-08: completar diseño, pantallas y todos los botones para presentación; comportamiento local simulado permitido antes del backend.
- Este corte no importa la ancestry de `integration/storecore-int`, sus migraciones V8–V21 ni el candidato backend FE04. Cualquier dependencia faltante se incorpora como delta mínimo separado y revisado sobre `master`.
- Demo y producción comparten componentes y contratos; una composición explícita elige adaptadores. DEMO no acredita integración real ni homologación.
- Rama de promoción documental: `promotion/storecore-master-demo-sdd`.

Leer [funcional](1-functional/spec.md), [inventario verificable](1-functional/route-cta-inventory.json), [técnico](2-technical/spec.md), [plan](3-tasks/plan.md), [DAG](3-tasks/tasks.json) y [evidencia](4-implementation/progress.md).

Este contrato complementa el sistema visual existente y sustituye, para la presentación frontend, la dependencia temporal de FE04 backend. No acredita integración real ni homologación. Su promoción a `master` requiere CI propio y revisiones independientes sobre el SHA exacto de este nuevo linaje.
