# Meta — comando capability y frontera tipada frontend

- Feature id: 20261001-capability-command-closed-type
- Estado: building; código preparado, validación ejecutable pendiente.
- Base: origin/pr-134; rama fix/int-capability-command-closed-type.
- Fuente: contrato `CapabilityStateRequest` y `capabilityConsolePayload` del backend; modelo frontend observado en esa base.
- Alcance autorizado: corregir correlationId ausente, enviar expectedConfigVersion actual y cerrar tipos module/state en frontend.
- Skills aplicados: sdd-workflow y angular-standards (lane existente ComponentStore/Clean Architecture, sin nueva librería).
- Sensibilidad: sólo referencias relativas al repositorio; sin hosts, credenciales ni datos operativos.
- Dependencia: PR #134 conserva su propio gate; este corte no afirma su integración.

WIP abierto. Sin activación de módulos, cambios backend/DDL, roles, ML, navegación, dependencias, companion/live/fiscal, promoción a master, release ni sdd.finish.
