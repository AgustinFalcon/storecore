# Commerce closed states and fulfillment eligibility

Feature: `20261006-commerce-closed-states-and-fulfillment-eligibility`.
Status: `implementation_in_progress`; Sol GO documental registrado; implementación local parcial, gates runtime/review pendientes.
Branch: `fix/commerce-fulfillment-eligibility`.
Source baseline: `de6a0d7cce780d3db3785468489b237b322b82d9` on the master-derived checkout.
Language: Spanish. Owner: StoreCore core maintainers; Sol owns GO/NO-GO.

Objetivo: impedir despacho/devolución de pedidos sin acreditación y consumo de
stock verificables, cerrar tipos de comercio y eliminar reposición implícita.
El audit fuente es revisión estática de los archivos citados en la especificación
técnica; no representa ejecución ni homologación. Las guías Falcon SDD workflow,
E2E evidence, closed-domain policy y estándares Spring/Angular informan este plan.

Autoridad: `AGENTS.md`, `sdd/STATUS.md`, `PROJECT.md`, `PATTERNS.md`,
`TRACEABILITY.md`, `RELEASE.md`. Relacionado: baseline archivado
`20260921-single-tenant-installation-baseline`, MP live checkout diferido y
hardening de master. No modifica sus gates externos.

Decisión acotada: recepción completa de RMA sin efecto de stock; inspección,
disposición por ítem y reposición se difieren a
`commerce-rma-item-disposition-and-restock`. No se presume que ese corte exista
ni esté aprobado. Hasta su aprobación INSPECTED/ADJUSTED se rechazan.

GO documental: `sdd/reviews/20261006-commerce-fulfillment-plan-sol.md`.
Fuente modificada sin commit en la rama indicada; no existe head nuevo para CI
o review dual. Sin migración ejecutada, commit, push, PR, merge, archive, tag,
despliegue, credenciales live o activación. PostgreSQL/E2E/clean/upgrade BLOCKED
por ACL local; ver evidencia de implementación. Disposición/restock sigue diferido.
