# SC22 Real — inventario de sólo lectura
> **Procedencia:** evidencia histórica de un árbol de integración previo al split. El
> SHA exacto no es recuperable (`UNKNOWN/UNVERIFIED`); por tanto, estos resultados
> no certifican el PR #195 ni `master`. Consultar `historical-provenance.md` y
> repetir todos los gates sobre el SHA dueño antes de promover el corte.

Fecha: 2026-10-16
Alcance: `/user/inventory`, contrato Real `listInventory` y decodificación estricta del snapshot.

## Resultado implementado

- Encabezado operativo, actualización explícita mediante GET, cuatro métricas del snapshot completo y aclaración de que disponible, reservado y seguridad son campos independientes.
- Búsqueda por SKU, filtro cerrado, conteo, limpieza y estado recuperable sin coincidencias.
- Tabla desktop y tarjetas móviles con SKU, estado derivado, disponible, reservado y nivel de seguridad.
- `InventoryAvailability` e `InventoryFilter` son tipos cerrados con `Unknown`; la vista no compara strings mágicos.
- El borde acepta sólo SKU no vacío y cantidades enteras no negativas. Ausentes, nulos, booleanos, textos, negativos o fracciones quedan `Unknown` y `No informado`; nunca se convierten en stock cero.
- Si falta cualquier componente de un total, el agregado completo también muestra `No informado` en vez de fabricar un subtotal.
- Una colección malformada falla como lectura. Si falla una actualización con snapshot previo, la pantalla identifica expresamente que se conserva la última lectura.
- Cambio de actor limpia el snapshot y los filtros. El corte no enlaza el endpoint backend de ajuste ni agrega escrituras ficticias.
- Pulido visual posterior: densidad móvil reducida, métricas sin indentación nativa y controles de búsqueda/filtro alineados con botones.

## Evidencia automatizada

- Arquitectura: **6/6 PASS** (`Container → View → Store → UseCase → HTTP repository`).
- ESLint completo: **PASS**.
- Unitarias completas: **138 archivos / 595 tests PASS**.
- Focalizadas SC22: **4 archivos / 16 tests PASS**.
- Build producción final: **PASS**, `675.67 kB` raw / `149.58 kB` transferencia estimada para main; `694.39 kB / 153.04 kB` total inicial.
- Browser Chromium: **3/3 PASS** a `390 / 768 / 1440`; sin overflow horizontal, Axe sin violaciones serious/critical y cero solicitudes de escritura o inesperadas.
- El servidor Angular temporal y Chromium finalizaron al cerrar la suite.

## Reviews coordinadas Astra

- Bugbot: **APPROVE**, 0 P1/P2.
- Security: **APPROVE**, 0 P1/P2.
- UX/Product: **APPROVE**, 0 P1/P2; los tres P3 de densidad y controles fueron corregidos y Playwright volvió a pasar 3/3.

## Límites explícitos

- No se resta reservado ni seguridad de disponible.
- No se infieren stock físico, daños, condición Outlet, vendibilidad, movimientos ni conciliación.
- No hay ajuste de stock, historial ni escritura en este contrato Real.
- Esta aprobación corresponde a la implementación provisional. Stitch SC22 continúa registrado como `operator-batch-02-r6-changes-requested`; no habilita todavía PR o merge.
- No se creó commit, PR, merge ni publicación.
