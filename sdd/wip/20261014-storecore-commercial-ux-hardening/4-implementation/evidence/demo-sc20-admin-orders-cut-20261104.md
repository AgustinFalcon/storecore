# SC-SURF-20 — cola administrativa Demo

Base: `8255d81480ce2e376e69546598c5c34c73f7962f`. Fecha: 2026-11-04.
Estado: implementación local verificada y aprobada; sin commit, push, PR, merge,
publicación, backend ni cambios Real.

## Alcance implementado

`/demo/user/orders` usa el ledger canónico de doce pedidos del snapshot, sin un
segundo origen de datos. La migración V7→V8 es aditiva y atómica. Estados de pago,
entrega, retiro, incidencia, posventa, alcance operativo y filtros son tipos cerrados
con traducción única en el borde y caso `Unknown`.

Admin y Operator consultan la cola y ejecutan únicamente los comandos permitidos.
Despachar exige tracking manual; entregar y retirar respetan incidencias y posventa.
La selección es informativa, conserva filas ocultas por filtro y exporta sólo los IDs
seleccionados mediante CSV exacto. Filtros, búsqueda y pedido enfocado viven en URL y
preservan back/forward/reload.

El detalle alcanzable desde la cola no mantiene una segunda política: los pedidos de
alcance Queue son lectura y regresan a la gestión canónica; los escenarios Legacy
conservan sus comandos anteriores. La misma capacidad impide mostrar acciones de pago
inoperables al comprador. Posventa SC14 permanece separada.

La compatibilidad legacy aplica una regla general: `incidentStatus` ausente con texto
legacy implica `Open`; wire desconocido presente implica `Unknown`; ausencia sin texto
implica `None`. No hay excepción por ID y el baseline ORD-1015 sin texto conserva su
serialización byte a byte.

## Estados, recuperación y accesibilidad

La cola cubre loading, vacío, sin resultados, error de lectura, `Unknown`, conflicto y
fallo de persistencia. Los diálogos nativos aíslan el fondo, soportan Escape y ciclo de
Tab, conservan borradores y restauran foco. Si una transición elimina la fila filtrada,
el foco vuelve a un control estable. La exportación fallida conserva selección/filtros
y ofrece recuperación propia; no reutiliza el flujo de transición.

## Verificación final

- `npm run verify`: **702/702 PASS**, arquitectura **6/6**, lint y build Real PASS.
- Build Demo: PASS.
- Unit/component focal: **35/35 PASS**.
- Chromium SC20 final: **12/12 PASS**.
- Posventa + inventario CTA: **37/37 PASS**.
- Revisión Astra técnica final: `APPROVE — 0 P0–P3`.
- Revisión Astra UX/producto/accesibilidad final: `APPROVE — 0 P0–P3`, con
  reproducción independiente a 1440/768/390, texto 200 %, teclado, axe y navegación.

Fingerprint SHA256 de 38 archivos fuente:
`44533724DDFC019AA32598400C50899651CA86584A32BB2F7CA1D315DB8B4790`.

Bundle Demo SHA256:
`A964E145F985B83C346BCAF3BBB3CE999E99C9ED14DE6C0C7E42D0C40D27C785`.

Artefactos finales locales ignorados por Git:
`frontend/test-results/sc20-r3-focused-final`.

Una corrida combinada anterior terminó 48/49 por un selector ambiguo del nuevo E2E
de Mica; el selector se corrigió y quedó cubierto por el focal final 12/12. No se
presenta esa corrida como 49/49.

## Límites

Este corte no implementa backend, `/user/orders`, proveedores, cobros reales,
facturación, envío real, homologación ni SC21 visual completo. La promoción por PR y
los gates de integración permanecen separados.
