# Plan — contrato fiscal StoreCore

**Estado:** documentación completa; todas las tareas de código están bloqueadas por diseño.

| ID | Trabajo | Estado | Salida requerida |
| --- | --- | --- | --- |
| SC-T01 | Mantener trazabilidad y registro de decisiones entre discovery, contrato StoreCore y biblioteca versionada. | Done | STATUS, RTM y decision-register canónicos. |
| SC-T02 | Registrar decisión fiscal del emisor, matriz, servicio, PV, trigger y rectificativos. | Blocked: holder + accountant | D-01..D-06 con evidencia saneada. |
| SC-T03 | Fijar contrato Mercado Pago/origen, validación, idempotencia y correlaciones. | Blocked: product + platform | D-07 y SC-01/SC-02 aprobados. |
| SC-T03b | Decidir provenance/ownership de inbox-outbox y capability fiscal. | Blocked: platform + Sol GO | SC-07 aprobado; sin reutilización implícita de `integration_outbox`. |
| SC-T04 | Abrir WIP implementable de datos/outbox/worker/lock, con modelo y migraciones revisados. | Blocked: SC-T02 + SC-T03 + SC-T03b + Sol GO | SC-03/SC-04 resueltos; no introducir `store_id`. |
| SC-T05 | Implementar el adaptador contra una versión publicada de la biblioteca. | Blocked: SC-T04 + library candidate | Pruebas de recuperación y seguridad aprobadas. |
| SC-T06 | Provisionar perfil de homologación y ejecutar end-to-end. | Blocked: issuer authorization | WSASS, certificado de prueba, configuración y evidencia saneada. |
| SC-T07 | Activar producción por emisor. | Blocked: explicit release gate | Revisión fiscal, operacional, seguridad y Sol GO. |

No existe una tarea implementable derivada de este plan hoy. Cuando se cierren los gates, el nuevo WIP deberá reemplazar este contrato `documented_deferred`, no reinterpretarlo de manera implícita.
