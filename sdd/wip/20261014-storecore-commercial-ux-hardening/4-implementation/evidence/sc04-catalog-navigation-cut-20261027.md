# SC-SURF-04 — exploración y retorno de catálogo Demo

## Base y alcance

- Base apilada: `ccb54bcbbb045f33aae6f23ed850bf7761282378`.
- Superficie: frontend Demo de StoreCore, experiencia comprador.
- Flujo: buscar, filtrar, ordenar, paginar, abrir un producto y volver conservando el contexto público en la URL.

No modifica backend, contratos HTTP, persistencia comercial, checkout ni pantallas administrativas.

## Decisiones

- `DemoCatalogLocation` es el único traductor entre query params y criterios tipados.
- Disponibilidad y orden son tipos cerrados; valores futuros quedan en `Unknown` y muestran recuperación explícita.
- La ausencia de precio máximo se representa con `null`; cero conserva significado explícito.
- `DemoCatalogPresenter` filtra, ordena por precio efectivo y acota páginas sin depender de Angular.
- Los cambios de edición reemplazan la entrada de historial; paginar y abrir producto son navegaciones explícitas.

## Verificaciones

- Arquitectura: 6/6 PASS.
- Lint: PASS.
- Unitarias: 53 archivos, 269 pruebas PASS.
- Build productivo: PASS.
- Unitarias focalizadas de catálogo: 16/16 PASS.
- Playwright focalizado de catálogo: 5/5 PASS.
- Matriz completa de CTA: 7/7 PASS.
- Regresión Demo completa sobre el árbol final: 32/32 PASS.

## Límites

- Este corte no rediseña el PDP ni agrega nuevos atributos de producto.
- La pantalla administrativa de inventario queda para un corte independiente.
- TASK-007 y TASK-009 permanecen abiertas; esta evidencia sólo cierra el fragmento SC-SURF-04.
