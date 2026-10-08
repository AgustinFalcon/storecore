# DAG de cortes

INT-FE-00 precede todo. INT-FE-01 corrige capability; INT-FE-02 depende de 01 y resuelve migración UA; INT-FE-03 depende de 02 y lleva frontend/#176. INT-FE-04 depende de 03 para CFE sobre sesiones reales. INT-FE-05 y 06 dependen de 03; INT-FE-07 reúne 04/05/06 y valida manifest, a11y y E2E real.

DAG canónico en [tasks.json](tasks.json). IDs INT-FE-00..07 pertenecen a este WIP y no reemplazan INT-FE-001..004 del WIP histórico frontend-slice-integration.

Cada corte se basa en el último head integrado y porta sólo archivos/hunks allowlisted; revalidar origen/destino y checksums antes de escribir. Tareas pendientes no tienen GO implícito por este documento. Ningún merge masivo master ni activación externa. Commit documental local no es merge, review ni cierre del producto.
