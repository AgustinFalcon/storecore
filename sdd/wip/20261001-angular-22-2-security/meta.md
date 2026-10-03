# Meta — Angular 22.2 security update

- Feature id: `20261001-angular-22-2-security`.
- Estado: implemented_unverified; WIP abierto.
- Base: `origin/integration/storecore-int` en `a8874ad`.
- Objetivo: retirar dependencias frontend con advisories conocidos sin cambiar comportamiento de producto.
- Fuente: `npm audit` sobre el lock de integración y GitHub Advisory Database (`GHSA-p297-fm68-3q8c`, `GHSA-hh8m-fm6v-7cvg`, `GHSA-ff3f-86qr-9cv3`, `GHSA-67c8-pqhq-4rmx`).
- Sensibilidad: sin credenciales, hosts privados ni datos operativos.

Sin cambios backend, contratos, rutas, live, companion, fiscal, release, `master` ni `/sdd.finish`.
