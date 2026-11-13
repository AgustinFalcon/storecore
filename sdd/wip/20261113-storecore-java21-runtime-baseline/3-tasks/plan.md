# Plan — baseline Java 21

| ID | Trabajo | Estado | Evidencia / gate |
| --- | --- | --- | --- |
| J21-001 | Inventariar POM, jobs CI y documentación operativa. | Done | Baseline Java 17 localizada en tres superficies. |
| J21-002 | Aprobar alcance funcional y técnico sin cambios de dominio. | Done | Specs de este WIP. |
| J21-003 | Actualizar POM, CI y guía E2E a Java 21. | Done | Diff acotado a manifiestos/documentación. |
| J21-004 | Ejecutar suite backend local bajo JDK 21. | Done | `mvn -B clean test`: 399 tests, 0 fallos/errores/omitidos, `BUILD SUCCESS`. |
| J21-005 | Ejecutar revisiones de compatibilidad y seguridad. | Done | GPT-6.1 Sol: dos `APPROVED`, sin P0–P3 ni discrepancias. |
| J21-006 | Ejecutar CI completo en PR. | Done | Run `43453833670`: backend, frontend y E2E real en verde. |
| J21-007 | Fusionar y verificar CI post-merge. | Pending | SHA de merge y run de `master`. |

La finalización de J21-007 sólo declara el baseline Java 21. No hereda ni
simula aprobación fiscal, credenciales, homologación o activación ARCA.
