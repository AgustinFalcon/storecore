# Evidencia Real SC17 — catálogo administrador

Fecha: 2026-10-16
Alcance: paridad productiva limitada de `SC-SURF-17`; no acredita por sí sola TASK-014, TASK-018, TASK-021, TASK-022 ni TASK-024.

## Contrato implementado

- `ProductActivation` y `CatalogActivationFilter` son tipos cerrados con `Unknown` y un único `fromWire`.
- El mapper HTTP nunca interpreta ausencia o valor futuro como activo.
- El repositorio rechaza `Unknown`, serializa un booleano y normaliza las imágenes con el mismo criterio que valida el store.
- La vista separa listado, filtros, galería, variantes y precio; no ofrece baja de variantes persistidas porque el backend actual sólo hace upsert.
- El ID de variante existente es informativo y el servidor asigna el de las altas.
- Stock es sólo lectura y remite a Inventario; observado, deseado y efectivo no se editan desde este contrato.
- El borrador tiene dirty-check, descarte explícito, guard de navegación, `beforeunload`, bloqueo durante escritura y limpieza ante cambio de actor.
- La vista Real incorpora reflow, foco al editor y estados empty/error/Unknown recuperables sin inventar Outlet, historial o lifecycle de variantes.

## Ciclos Astra coordinados

1. Bugbot y Security detectaron baja ficticia de variante e ID cliente obligatorio; UX/Product agregó pérdida silenciosa de borrador, producto incompleto y etiquetas deficientes.
2. Los tres gates detectaron imagen vacía y reconciliación insegura durante una escritura; Security agregó el fence de actor del diálogo pendiente.
3. Tras normalización, bloqueo de edición/escritura y limpieza al reset de actor: **Bugbot APPROVE, Security APPROVE, UX/Product APPROVE; 0 P1 / 0 P2**.

P3 no bloqueantes preservados para un corte posterior: formato monetario localizado y feedback separado de carga/guardado/éxito.

## Evidencia ejecutable

- `npm run check:architecture`: **6/6 PASS**; scan Container → View → Store → UseCase → HTTP repository PASS.
- `npm run lint`: **PASS**.
- `npm test`: **133 archivos / 580 tests PASS**.
- `npm run build`: **PASS**, `642.32 kB` raw / `145.10 kB` estimado para `main`.
- `npx playwright test e2e/admin-catalog.spec.ts --workers=1`: **3/3 PASS** en 390, 768 y 1440 px.
- El browser gate verifica: ausencia de overflow horizontal, foco móvil al editor, stock read-only, protección de borrador, Axe sin impactos serious/critical y aislamiento de red.
- El webServer temporal de Playwright finalizó con la suite; no quedan recursos de validación activos.

## Límites preservados

- No se creó commit, PR, merge ni publicación.
- No se atribuye al backend una eliminación/archivo de variantes que no existe.
- No se acredita el triple gate Stitch global de las 26 superficies; SC17 usa su revisión ya aprobada y evidencia Angular ejecutable propia.
