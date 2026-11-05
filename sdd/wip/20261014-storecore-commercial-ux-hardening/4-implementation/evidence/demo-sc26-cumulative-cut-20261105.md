# SC-SURF-26 — administración de clientes, corte acumulativo

Base `9b5b52ccc76e68af14442efec32d9c5239d45973`, fecha 2026-11-05.
Implementación local aprobada; sin push, PR, merge, backend ni deploy.

## Alcance y reconciliación

- Búsqueda, ficha, pedido correlacionado, restricción y reactivación Demo preservadas.
- Resultado de comando cerrado: Saved, Failed, Conflict, Uncertain, Denied y Unknown.
- Escritura con readback/rollback no verificables queda Uncertain, pasa a consulta y
  sólo permite reconciliar por lectura; nunca reenvía el comando automáticamente.
- Restricción/reactivación conservan perfil, direcciones, carrito, pedidos y posventa;
  las generaciones de cliente invalidan sesiones afectadas y reactivar exige login.
- Origen cerrado restaura Clientes→Pedido→Clientes; refresh/entrada directa/query
  manipulada usan Pedidos como fallback seguro.
- Operator mantiene administración de clientes read-only. Una vez dentro de SC21 rige
  el alcance posterior aprobado de SC21, que permite operaciones a Admin y Operator;
  esto reemplaza la afirmación histórica de que el enlace no tenía handlers mutables.
- Encabezado y diálogos reflow a texto 200 % sin overflow en 320/390/768/1440.

## Gates ejecutados

- `npm run verify`: PASS; arquitectura 7/7, lint PASS, **118 archivos / 905 tests**,
  build Real PASS. Dos corridas globales normales consecutivas fueron verdes después
  de limpiar listeners/timers de los fixtures SC26.
- `npm run build:demo`: PASS.
- Playwright SC26 actual: **18/18 PASS**, 38 scans axe con cero violaciones.
- Regresión combinada: **87/87 PASS** — CTA global 25, SC21 12, SC24 12, SC25 38;
  cero unexpected, skipped o flaky.
- Revisión técnica GPT-6.1 Astra: `APPROVE — 0 P0-P3`.
- Revisión UX/producto GPT-6.1 Astra: `APPROVE — 0 P0-P3`; reproducción propia 7/7.

Fingerprint del diff frontend staged revisado:
`8cc18a12e49359c7dcb2a06e62baa395975c2351`.

Reportes: `frontend/demo-e2e/artifacts/sc26/results.json` y
`frontend/demo-playwright-report/results.json`. Capturas bajo el directorio ignorado
`frontend/demo-e2e/artifacts/sc26/`. Puerto 4390 y servidores de prueba cerrados.

## Límites honestos

Este corte certifica la Demo local y sus contratos de frontend. No prueba backend
vivo, integración externa, homologación, deploy ni CI remoto. Los gates exactos de PR
y merge se ejecutarán recién en la etapa de integración autorizada.
