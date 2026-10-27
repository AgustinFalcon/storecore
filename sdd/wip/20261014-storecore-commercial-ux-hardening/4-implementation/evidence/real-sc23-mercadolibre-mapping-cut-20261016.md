# SC23 Real — cuenta y mapeos de Mercado Libre
> **Procedencia:** evidencia histórica de un árbol de integración previo al split. El
> SHA exacto no es recuperable (`UNKNOWN/UNVERIFIED`); por tanto, estos resultados
> no certifican el PR #195 ni `master`. Consultar `historical-provenance.md` y
> repetir todos los gates sobre el SHA dueño antes de promover el corte.

Fecha: 2026-10-16
Alcance: `/user/mercadolibre`, lecturas `account`/`listings` y guardado del mapeo existente.

## Resultado implementado

- Encabezado operativo, cuenta autoritativa, búsqueda, conteo, tabla desktop y tarjetas móviles para los mapeos existentes.
- Editor exacto de cuenta numérica, publicación, variación y SKU; no expone OAuth, lifecycle, precios, stock, sincronización ni competencia como capacidades reales.
- `MercadoLibreMappingPhase`, `MercadoLibreMappingMode` y `MercadoLibreMappingEligibility` son tipos cerrados. El borde normaliza y valida IDs, SKU y cuenta, y cualquier wire desconocido falla cerrado.
- La URL codifica el ID externo y el PUT serializa sólo `{ accountId, variationId, sku }`.
- Cuenta activa/autorizada se revalida antes de escribir. Una confirmación explícita es obligatoria y un intento se serializa sin reenvío automático.
- La identidad tripleta de un mapeo existente queda inmutable. Un mapeo creado con una tripleta existente se presenta honestamente como remapeo y muestra el SKU anterior autoritativo.
- Tras el PUT siempre se exige coincidencia exacta en una nueva lectura. Timeout o respuesta ambigua se reconcilian; si no puede verificarse, queda `Uncertain`, conserva el borrador y bloquea otro PUT.
- `Uncertain` permite actualizar, descartar o salir, pero nunca editar/enviar hasta una lectura recuperadora. Cambio de actor cancela y limpia todo el estado.
- Borradores protegen selección, navegación y recarga; los diálogos soportan Escape, foco inicial, trampa y restauración de foco.

## Evidencia automatizada

- Arquitectura: **6/6 PASS** (`Container → View → Store → UseCase → HTTP repository`).
- ESLint completo: **PASS**.
- Unitarias completas: **140 archivos / 608 tests PASS**.
- Focalizadas finales SC23: **7 archivos / 55 tests PASS**; pulido posterior de vista/store: **2 archivos / 15 tests PASS**.
- Build producción: **PASS**, `697.44 kB` raw / `153.19 kB` transferencia estimada para main; `716.16 kB / 156.65 kB` total inicial.
- Browser Chromium final: **3/3 PASS** a `390 / 768 / 1440`; sin overflow horizontal, Axe sin violaciones serious/critical y cero solicitudes inesperadas.
- El servidor Angular temporal y Chromium finalizaron al cerrar cada suite.

## Reviews coordinadas Astra

- Bugbot: **APPROVE**, 0 P1/P2.
- Security: **APPROVE**, 0 P1/P2.
- UX/Product: **APPROVE**, 0 P1/P2.
- Los P3 finales de foco, texto neutral y ancho fueron corregidos y Playwright volvió a pasar 3/3.

## Límites explícitos

- No se conecta ni desconecta una cuenta, no se inicia OAuth y no se mutan publicaciones externas.
- No se sincronizan stock/precio ni se monitorean competidores desde esta pantalla.
- La aprobación corresponde a la implementación Real provisional. Stitch SC23 continúa `CHANGES_REQUESTED`; no habilita todavía PR o merge.
- No se creó commit, PR, merge ni publicación.
