# Plan de implementación

## Corte A — dominio, datos y comandos

- [x] TASK-001 Tipos cerrados y pasos independientes de schema/selección.
- [x] TASK-002 Migración PostgreSQL, vectores diferibles e interlock legacy.
- [x] TASK-003 Writer único/CAS para schema, asignaciones y actividad.
- [ ] TASK-004 Proyección pública/admin y contrato wire fail-closed.
- [ ] TASK-005 Búsqueda pública/admin por nombre, SKU y categoría.

## Corte B — experiencia Angular

- [ ] TASK-006 Motor de selección e intención tombstonada.
- [ ] TASK-007 Select/Swatch accesibles y compra derivada de una selección.
- [ ] TASK-008 Editor ADMIN con diff/reaplicación explícita tras 409.

## Corte C — pruebas integrales

- [ ] TASK-009 PostgreSQL, API, concurrencia, límites y regresión legacy.
- [ ] TASK-010 Browser responsive de comprador/admin y búsqueda.

## Corte D — evidencia

- [ ] TASK-011 Review exact-head de código, producto y arquitectura.
- [ ] TASK-012 Review exact-head de performance PostgreSQL/Angular.
- [ ] TASK-013 Review exact-head de seguridad.
- [ ] TASK-014 CI, PR, merge y post-merge con evidencia separada.

La implementación se realiza en PR separado de este contrato documental y no
cierra #10 hasta que los catorce gates estén completos.

El corte inicial también implementa y prueba el motor puro de TASK-006, pero esa
tarea permanece abierta hasta integrar tombstones durables, fences de generación
y la selección autoritativa con el PDP.
