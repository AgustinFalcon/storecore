# Commerce closed states and fulfillment eligibility

Feature: `20261006-commerce-closed-states-and-fulfillment-eligibility`.
Status: `implementation_in_progress`; PR #171 MERGED; CI y reviews duales exact-head aprobados; gates residuales de aceptación pendientes.
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
PR #171 MERGED: head `b3e4b3baa47f3abdabd4140b3bbcee975e4c3474`, merge
`84f1b025`. Verify exact-head `37630043935`: frontend, backend y
`unified-access-real-e2e` success. Dos reviews independientes GPT-6.1 Sol
APPROVED sin P0–P3 sobre ese head y fingerprint
`459CB299E61B864DB52A5B3E2FB676BC213BA1C94307731BAC5E54F115647572`.
La suite browser citada cubre acceso unificado; no acredita por sí sola browser
CFE específico. Clean/upgrade y los restantes gates no acreditados siguen
pendientes; no hubo CI push de master. Sin archive, tag, despliegue,
homologación, credenciales live ni activación. Disposición/restock sigue diferido.
