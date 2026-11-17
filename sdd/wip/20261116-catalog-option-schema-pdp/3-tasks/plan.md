# Plan de implementación

## Corte A — dominio, datos y comandos

- [x] TASK-001 Tipos cerrados y pasos independientes de schema/selección.
- [x] TASK-002 Migración PostgreSQL, vectores diferibles e interlock legacy.
- [x] TASK-003 Writer único/CAS para schema, asignaciones y actividad.
- [x] TASK-004 Proyección pública/admin y contrato wire fail-closed.
- [x] TASK-005 Búsqueda pública/admin por nombre, SKU y categoría.

## Corte B — experiencia Angular

- [x] TASK-006 Motor de selección e intención tombstonada.
- [x] TASK-007 Select/Swatch accesibles y compra derivada de una selección.
- [x] TASK-008 Editor ADMIN con diff/reaplicación explícita tras 409.

## Corte C — pruebas integrales

- [x] TASK-009 PostgreSQL, API, concurrencia, límites y regresión legacy.
- [ ] TASK-010 Browser responsive de comprador/admin y búsqueda.

## Corte D — evidencia

- [ ] TASK-011 Review exact-head de código, producto y arquitectura.
- [ ] TASK-012 Review exact-head de performance PostgreSQL/Angular.
- [ ] TASK-013 Review exact-head de seguridad.
- [ ] TASK-014 CI, PR, merge y post-merge con evidencia separada.

La implementación se realiza en PR separado de este contrato documental y no
cierra #10 hasta que los catorce gates estén completos.

TASK-006 integra el motor cerrado con la selección autoritativa del PDP, retiro
síncrono de referencias, tombstones durables, fences de generación y bloqueo
fail-closed. TASK-007 proyecta esa autoridad en Select/Swatch nativos,
accesibles y responsive; separa elegibilidad de variante de cantidad comprable
y aísla favoritos de los hechos autoritativos del catálogo.
TASK-008 agrega el editor administrativo independiente con lectura OPERATOR,
escritura ADMIN, CAS por revisión, diff base/local/remoto, reaplicación
explícita, confirmación de Clear, reconciliación fail-closed y alta de variantes
inactivas. La evidencia focal incluye 12 pruebas de dominio/repositorio/store,
1.584 pruebas Angular de regresión y Playwright/Axe en 390/768/1440 px.
