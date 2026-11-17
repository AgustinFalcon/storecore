# Evidencia exact-head TASK-011 y TASK-012

## Corte validado

- Base acumulativa: `5cba1ec`
- Cabeza aprobada: `82da298565266fa003231e027a32f243f22d24d4`
- Rama: `fix/storecore-option-review-findings-20261117`
- Estado del árbol al revisar: limpio

## TASK-011 — código, producto y arquitectura

GPT-6.1 Astra y GPT-6.1 Sol revisaron el diff acumulado y emitieron `APPROVE`
sin hallazgos P0–P3. La ronda final verificó con el store real:

- `CATALOG_OPTION_REVISION_CONFLICT` eleva el piso a la revisión esperada más
  uno; una relectura igual a la base queda bloqueada y una posterior válida
  permite comparar y reaplicar.
- `RevisionExhausted` y un 409 no tipado conservan semánticas independientes.
- Un snapshot `Unknown r7` conserva r7 como mínimo y rechaza lecturas conocidas
  inferiores antes de volver a habilitar escritura.
- Una respuesta de listado iniciada antes del bloqueo no puede degradar la
  autoridad; una consulta nueva sí puede recuperar evidencia válida en la misma
  revisión.
- La recuperación `Absent → Unknown → Absent` conserva cambios locales de
  actividad por `variantId` cuando el servidor no modificó esa variante.
- El mapper administrativo tolera borradores inactivos parciales; el mapper
  público continúa fail-closed.

## TASK-012 — performance

`OptionDraftRebase.inflate` indexa ejes, valores, variantes, opciones y altas
pendientes en un recorrido de los paths. Ya no crea una expresión regular ni
recorre la colección completa por variante.

Benchmark exacto de Sol en Chromium 153:

- 1.000 variantes;
- 4.000 asignaciones;
- cuatro ejes con 50 valores;
- diez corridas: 7,7–16,4 ms;
- referencia anterior: 713–758 ms.

La regresión automatizada usa la cardinalidad máxima soportada y verifica la
preservación conjunta de un cambio local y otro remoto independiente.

## Gates locales finales

- Angular: 224 archivos, 1.595 pruebas, 0 fallos.
- ESLint: aprobado.
- Arquitectura: 9/9; `Container → View → Store → UseCase → HTTP repository`.
- Build productivo: aprobado; bundle inicial 699,99 kB.
- `git diff --check`: limpio.

TASK-013 (seguridad) y TASK-014 (CI/PR/merge/post-merge) permanecen abiertos.
Este documento no autoriza ni declara merge.
