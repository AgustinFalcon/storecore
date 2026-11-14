# Meta — Angular 22.2 security update

- Feature id: `20261001-angular-22-2-security`.
- Estado: reviewed_local; WIP abierto hasta CI y post-merge.
- Base: `origin/master` en `b768ce4`.
- Issue: `#138`.
- Objetivo: retirar dependencias frontend con advisories conocidos al 2026-11-14 sin cambiar comportamiento de producto.
- Fuente: `npm audit --json` sobre el lock actual, `npm outdated --json`, el registro npm y GitHub Advisory Database.
- Sensibilidad: sin credenciales, hosts privados ni datos operativos.

El cero de audit registrado el 2026-10-01 es evidencia histórica y no representa el lock ni el registro actuales. Sin cambios backend, contratos, rutas, live, companion, fiscal ni `/sdd.finish` antes de PR, CI y post-merge.
