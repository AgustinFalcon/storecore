# SC23A Real — lectura profesional de Mercado Libre

Fecha: 2026-10-27

## Alcance propietario

- Ruta Real `/user/mercadolibre` para `ADMIN` y `OPERATOR`.
- Lectura autoritativa de cuenta y mapeos publicación/variación → SKU.
- Búsqueda local por los tres identificadores, conteo visible y resumen completo.
- Estados diferenciados: carga inicial, actualización conservando snapshot, stale, error inicial, acceso denegado, vacío, sin coincidencias y Unknown.
- Reflow profesional para 390, 768 y 1440 px, foco visible, tabla transformada en fichas y caption de ancho completo.

## Límites honestos

Este corte es estrictamente GET/read-only. No ofrece OAuth, conectar/desconectar, mutación de publicaciones, guardar mappings, sincronización de stock/precio, retry de jobs ni seguimiento de competencia. La pantalla explica que esas capacidades permanecen en una etapa posterior; no presenta CTA inerte ni simula una confirmación del proveedor.

## Evidencia ejecutada en el árbol integrado

- TypeScript productivo y de specs: **PASS** (`tsc --noEmit`).
- ESLint focalizado de component, view, spec y E2E: **PASS**.
- Gate integrado `npm run verify`: **PASS** — arquitectura, lint, 62 archivos / 322 tests y build de producción.
- Unitarias focalizadas de tipos, mapper, presenter, store y view: **6 archivos / 36 tests PASS**.
- Playwright SC23A: **6/6 PASS**. Incluye 390/768/1440, búsqueda por publicación/variación/SKU, carga inicial, refresh reteniendo snapshot, stale, 403, vacío y estado de proveedor desconocido.
- Los tres tamaños no tienen overflow horizontal; Axe no reportó violaciones serious/critical y todas las solicitudes propietarias fueron GET.
- Inspección visual de las capturas 390 y 1440: jerarquía consistente, etiquetas sin quiebre, caption de ancho completo y tabla transformada en fichas legibles en mobile.

Pendiente del SHA propietario: revisión Astra producto/UX + técnica/seguridad y CI del futuro PR. Ninguna validación histórica reemplaza esos gates.
