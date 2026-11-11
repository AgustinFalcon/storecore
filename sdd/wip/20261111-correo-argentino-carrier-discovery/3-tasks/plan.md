# Plan — Correo Argentino carrier discovery

**Estado:** discovery documentado; código bloqueado por contrato y onboarding.

| ID | Trabajo | Estado | Salida requerida |
| --- | --- | --- | --- |
| CA-T01 | Inventariar baseline, fuentes oficiales y capacidades públicas. | Done | Specs y source register fechados. |
| CA-T02 | Seleccionar producto/API y obtener manual contractual vigente. | Blocked: titular + Correo | CA-D01..D03 cerradas. |
| CA-T03 | Cerrar operación, tarifas, límites, modalidades y facturación. | Blocked: comercial + operaciones | CA-D04..D10 cerradas. |
| CA-T04 | Cerrar arquitectura, seguridad, PII, resiliencia y estados. | Blocked: CA-T02/03 + review Sol | CA-SC01..SC10 cerradas. |
| CA-T05 | Abrir WIP implementable del adapter fail-closed. | Blocked: CA-T04 + Sol GO | Specs, ADR, RTM y tasks de código aprobadas. |
| CA-T06 | Implementar contrato seleccionado sin mezclar APIs. | Blocked: CA-T05 | Unit/contract/PostgreSQL/browser verdes. |
| CA-T07 | Homologar en QA oficial con credenciales por referencia. | Blocked: cuenta QA | Evidencia E2E saneada y capability nuevamente DISABLED. |
| CA-T08 | Activar producción. | Blocked: release gate explícito | Doble review Sol, CI exact-head, runbook, rollback y autorización del titular. |

No hay tarea de implementación autorizada en este WIP. Un futuro plan debe
reemplazar explícitamente este discovery y mantener su registro de decisiones.
