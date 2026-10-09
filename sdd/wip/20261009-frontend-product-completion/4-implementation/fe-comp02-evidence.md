# FE-COMP-02 — producto, medios y carrito multivariante

2026-10-09 (Buenos Aires). Baseline de producto `db377faf`; SDD aprobado `fc7bc614` incorporado como `098e9cc`. Corte frontend demo exclusivamente. Código backend FE04 continúa estacionado.

SHA de código final verificado: `0c28879b0ee59126d90f6a54c9e8a1a501f791d9` (implementación `2927076`, protección de historial `b2746be`, retiro de variantes no guardadas `0c28879`). El commit de evidencia posterior sólo modifica SDD.

## Implementación

- Identidades de variante abiertas y estables, independientes del SKU/label/index; atributos abiertos, precio propio en centavos, existencia/reserva propias, archivo y medios locales con alt. `DemoCurrency` cierra la moneda con `Unknown` en el borde.
- Editor de catálogo separado (`demo-product-editor`), borrador profundo: crear/editar, agregar/quitar variantes nuevas, archivar variantes existentes, atributos, imágenes locales, preview, guardar/cancelar. Las variantes existentes no se eliminan ni cambian de identidad; reservas vigentes se preservan. Cambios de inventario emiten movimiento por variante.
- PDP selecciona variante, disponibilidad y precio efectivo; galería cambia de asset realmente, zoom modal con Escape y retorno de foco, fallback honesto para variantes sin medios. Catálogo y alertas/inventario reflejan stock derivado por variante.
- Carrito por `variantId`: dos variantes del mismo SKU, fusión sólo de la misma variante, edición/remoción/restauración independientes. Líneas muestran imagen, nombre/atributos y precio. Resumen cambiado requiere aceptar importes actualizados antes de confirmar.
- Pedido congela ID, nombre, atributos, media, moneda, precio original/efectivo/descuento y cantidad. Editar el catálogo no modifica el historial. Compra/pago pendiente/aprobación/cancelación afectan exactamente la variante reservada. Dinero sin precisión segura falla antes de consumir.
- Snapshot v2 mantiene la clave local existente. El traductor migra v1 por correspondencia explícita Standard/Case, conserva dinero histórico, asigna reservas pendientes a su identidad y rechaza presentaciones/reservas incoherentes. No elige otra variante ante un valor desconocido. Clases legacy permanecen sólo por compatibilidad documental/wire; la selección nueva usa IDs abiertos.

## Trazabilidad de aceptación

- E02.1: `variants.spec.ts` crea producto `OPEN-CATALOG`, marca/categoría nuevas, dos variantes, atributos e imágenes diferenciadas. Guarda, recarga y compara admin/comprador. Tests de catálogo verifican medios permitidos/alt, identidades y datos inválidos. CTA matrix agrega/elimina medios/atributos/variantes y prueba Cancelar sin modificación del catálogo.
- E02.2: selección A/B cambia precio/imagen/disponibilidad; galería/zoom de assets distintos, foco/teclado y axe en 390/768/1440. Se conservan los tests de navegación entre SKU, sin stock y productos archivados. Unknown/archivado no autoriza agregado.
- E02.3: agrega A/B del mismo producto y un tercer producto, elimina sólo el tercero y cambia sólo cantidad A. Compra A/B; stock comprado queda A=1, B=0. Edición y recarga conservan líneas. Suite domain rechaza 0, negativos, fracciones, NaN/Infinity, exceso y overflow sin efectos.
- E02.4: admin repone exclusivamente B y modifica nombre/precio B; comprador conserva pedido por $500 y el nombre histórico. Cambio anterior al checkout muestra resumen actualizado y exige aceptación. Fixture v1 conocido migra a ID estable; identidad ajena falla con recuperación explícita.

## Verificación local

- `npm run build:demo`: PASS, 2.11 MB (demo sin optimización, mismo esquema anterior). Usó `subst U:` temporal, desmontado al terminar.
- `npm test`: PASS, 75 archivos / 322 tests. Incluye nuevos tests dominio de identidad, stock, reserva, snapshot, precio cambiado, migración, medios, overflow, ausencia de identidad histórica y moneda Unknown bloqueando settlement.
- `npm run lint` y `npm run check:architecture`: PASS; 6 tests de arquitectura y scanner.
- `node demo-e2e/run.mjs`: PASS 29/29 en el SHA final de código, salida 0, 0 skipped/flaky/unexpected, 2.4 min; auditoría 416 controles observados y ejecutados, 127 IDs estáticos, 0 sin ejecutar. Incluye precio efectivo consistente en selector/PDP, tercer producto, identidad histórica y quitar del borrador una variante no guardada.
- Axe: 0 violaciones en editor/PDP a 390/768/1440 tras corregir el contraste de Volver al catálogo (antes 3.95:1).
- Build production: BLOCKED_NETWORK al obtener la fuente Inter de Google Fonts. Se reintentó en el SHA final tras el aviso de permiso de red del coordinador; el contexto de este subagente sigue devolviendo `EACCES` (también en fetch directo de la fuente pública). El coordinador debe correr este check en su contexto de permiso. No se declara PASS productivo ni se cambió configuración para ocultarlo.

Artefactos locales no versionados: `frontend/demo-playwright-report/results.json`, `frontend/test-results/variants-variant-editor-and-gallery-keyboard-responsive-{390,768,1440}/variant-{editor,pdp}.png`. Adjuntos de reporte: `executed-cta-matrix`, `variant-data-trace` y las trazas de regresión de cantidades/carrito. Las capturas acreditan aspecto; las afirmaciones antes/después acreditan efectos.

## Gates y límites

Revisión independiente funcional/UX/seguridad, CI alojado y merge: pendientes; este registro no los sustituye. FE-COMP-03..06 siguen pendientes. Listings/cola ML continúan por SKU agregado en este corte; el mapping de variation y desired/observed/confirmed se completa en FE-COMP-06. Pagos, envíos, ML, fuentes de competencia y fiscal reales siguen sus contratos externos. Ninguna simulación prueba homologación.

Runner detiene su server en `finally`; no queda backend ni servidor demo requerido al finalizar. Junction node_modules sólo reutiliza dependencias locales, no es un proceso activo. No push ni PR desde este corte de implementación.
