# SC-SURF-24 Real — lectura profesional de módulos

Fecha: 2026-10-27

Base del corte: `d792ec8`

Ruta: `/user/capabilities`
Alcance: lectura productiva estricta; no incluye comandos de mutación ni afirma homologaciones.

## Resultado implementado

- Catálogo comercial exacto de siete fichas: Catálogo, Inventario, Mercado Libre, Outlet, ARCA, Envíos avanzados y Conectores de billeteras.
- Cada ficha separa estado operativo, disponibilidad y nivel de entrega. Los módulos sin ID productivo muestran `No aplica` en el eje operativo y no fabrican un wire value.
- La lectura autoritativa del backend se conserva completa en una tabla técnica separada. Los módulos técnicos adicionales no quedan ocultos por el catálogo comercial.
- Búsqueda normalizada y filtro cerrado de estado operativo, conteo y resumen. El resumen siempre corresponde al catálogo completo y no se reescribe con el filtro.
- Sólo se enlazan superficies Real existentes: Catálogo, Inventario y Mercado Libre. ARCA, envíos avanzados y billeteras no inventan rutas.
- Estados verificados: carga inicial, actualización con snapshot, error inicial recuperable, snapshot stale, 403 fail-closed, catálogo técnico vacío y estado de lectura `Unknown`.
- Diálogo de información nativo con nombre accesible, cierre por Escape y restauración de foco. La copia no equipara `ACTIVE` con integración u homologación.
- El recorrido es sólo lectura. El browser verificó que todas las solicitudes a `/user/capabilities` fueron GET y que no existen controles de cambio de estado.

## Evidencia automatizada del árbol integrado

- `npm run verify`: **PASS**.
  - Arquitectura: **6/6 PASS** (`Container → View → Store → UseCase → HTTP repository`).
  - ESLint: **PASS**.
  - Unitarias: **67 archivos / 343 tests PASS**.
  - Build producción: **PASS**, main `559.16 kB` raw / `124.75 kB` transferencia estimada; total inicial `576.86 kB / 128.09 kB`.
- `npx playwright test e2e/admin-capabilities.spec.ts`: **5/5 PASS**.
  - Reflow y recorrido funcional a **390 / 768 / 1440 px**.
  - Siete fichas y cuatro filas técnicas del fixture conservadas.
  - Búsqueda, filtro cerrado, limpieza, diálogo, Escape y foco restaurado.
  - Axe: **0 violaciones serious/critical** en los tres anchos.
  - Overflow horizontal: **0** en los tres anchos.
  - Red de capabilities: **GET-only**, sin intento de POST/PUT/PATCH/DELETE.
  - Recuperación stale → 403 y carga → error → vacío cubiertas.

## Límites explícitos

- La disponibilidad y el nivel de entrega son metadata cerrada de presentación; no son campos devueltos por el backend.
- Mercado Libre `INTEGRATION_READY` no implica sincronización automática ni homologación.
- ARCA, envíos avanzados y billeteras permanecen diferidos/bloqueados según el SDD; no se muestran certificados, QR, couriers ni emisión fiscal productiva.
- El endpoint productivo de mutación anterior no se expone desde este corte. El comando versionado, motivo, correlación y reconciliación requieren un corte propietario posterior antes de habilitar cualquier CTA.
- El diálogo deriva siempre desde el snapshot vigente, cancela su apertura diferida al perder acceso o destruir la vista y limpia sus referencias; las filas técnicas usan una identidad de render que admite múltiples módulos futuros traducidos a `Unknown`.
- Las capturas Playwright se generan como artefactos efímeros de test; este documento registra los resultados repetibles sobre el árbol dueño.
