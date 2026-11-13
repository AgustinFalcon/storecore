# Plan — disponibilidad de biblioteca ARCA

| ID | Trabajo | Estado | Evidencia / gate |
| --- | --- | --- | --- |
| ALR-001 | Verificar commit, versión, módulos y límites de publicación. | Done | `8efeace`, RC.4, Maven local; sin tag/paquete remoto. |
| ALR-002 | Verificar resiliencia, estados cerrados y pruebas del candidato. | Done | 78 pruebas, cobertura 89,03 %, SBOM y smoke consumidor. |
| ALR-003 | Reconciliar STATUS, RELEASE y backlog de StoreCore. | Done | Este corte documental. |
| ALR-004 | Aprobar matriz fiscal, emisor, PV, comprobantes y rectificativos. | Blocked | Titular + contador; evidencia saneada y fechada. |
| ALR-005 | Aprobar trigger durable, correlaciones y ownership inbox/outbox. | Blocked | Producto + plataforma + seguridad. |
| ALR-006 | Publicar/pinear una versión consumible y abrir WIP de adapter. | Blocked | ALR-004/005 + paquete remoto o estrategia reproducible aprobada. |
| ALR-007 | Ejecutar homologación WSAA/WSFEv1 y fallos/recovery. | Blocked | Credenciales autorizadas por referencia + ALR-006. |
| ALR-008 | Autorizar producción y `release/1.0`. | Blocked | Revisión fiscal, seguridad, operación y evidencia E2E. |

No se crea una tarea de código StoreCore antes de ALR-004/005. El cierre de
ALR-001/003 no hereda ni simula la aprobación fiscal del emisor.
