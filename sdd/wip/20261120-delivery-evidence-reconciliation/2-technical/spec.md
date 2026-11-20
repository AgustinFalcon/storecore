# Especificación técnica

## Fuente de verdad

La evidencia se obtiene de GitHub mediante el estado normalizado del PR y los
runs `Verify` asociados al head del PR y al merge commit. Un merge por sí solo
no alcanza.

## Mutaciones permitidas

- `meta.md`: transición del estado documental a `delivered`.
- planes y `tasks.json`: sólo tareas de entrega acreditadas.
- progreso: apéndice inmutable con PR, merge y runs.
- `sdd/STATUS.md`: nuevo bloque superior con el master vigente y residuales.

No se editan fuentes, tests, workflows, issues con residuales reales ni SDD de
multimedia en ejecución.
