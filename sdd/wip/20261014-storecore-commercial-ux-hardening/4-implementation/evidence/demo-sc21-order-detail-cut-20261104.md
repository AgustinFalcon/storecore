# SC-SURF-21 — detalle operativo y posventa Demo

Base: `0575b10b399cf744e02cc5da1e3cb32ab39074a2`. Fecha: 2026-11-04.
Estado: implementación local verificada y aprobada; sin push, PR, merge,
publicación, backend ni cambios Real.

## Alcance

Feature dedicada para `/demo/user/orders/:id`, seleccionada por la capacidad cerrada
del pedido: Queue usa SC21, Legacy conserva el detalle anterior y Unknown falla seguro.
Admin y Operator pueden operar; Customer/Unknown no reciben datos administrativos.
Cola y detalle comparten estados y políticas SC20, retorno tipado con filtros/foco y
guards de logística, incidencia y tracking.

ORD-1015 conserva `RETURN-1015-1`: una unidad ya reintegrada por $84.500 y una
disponible. El segundo expediente procesa la unidad restante mediante cinco objetos:
solicitar, recibir, inspeccionar, disponer y reintegrar. Recepción/inspección no alteran
stock; disposición Sellable/Damaged lo hace una vez; reintegro deriva $84.500 y no toca
stock. El acumulado termina en $169.000 con pago Aprobado intacto.

Los grafos nuevo e histórico conviven en el codec. Solicitudes Customer sobreviven
reload y registran al operador recién al recibir. Identidades/payload canónicos cierran
replay, conflicto y fase consumida. Eventos, disposición, stock y revisión se guardan
atómicamente; fallos conservan propuesta y requieren actualizar/revisar/reconfirmar.
Unknown bloquea efectos y oculta agregados no verificables. La proyección Customer no
expone notas internas.

## Experiencia

Cabecera neutral, ejes de pago/pedido/entrega separados, historial y expediente activo
independientes. Review muestra SKU, variante, cantidad, precio histórico, subtotal e
importe. Un solo CTA siguiente; futuros explican bloqueo. Diálogos soportan foco inicial,
trap, Escape, restauración y recuperación. Editar y actualizar tras fallo reenfocan el
encabezado estable. Timeline respeta fechas existentes y no inventa precisión.

Responsive verificado en 1440/768/390/320 y texto 200 %, sin overflow global/modal.
Los CTAs Legacy y generados permanecen operables; el inventario CTA incluye SC21 y no
mantiene entradas muertas.

## Gates finales

- `npm run verify`: **744/744 PASS**, arquitectura **6/6**, lint y build Real PASS.
- Build Demo: PASS, sin warnings.
- Focal unit/component: **81/81 PASS**.
- Browser final SC21 + CTA: **34/34 PASS**; CTA estricto **22/22**, SC21 **12/12**.
- Regresión conjunta anterior SC14/SC20/SC21 + CTA: **59/59 PASS**.
- Astra dominio/seguridad/continuidad: `APPROVE — 0 P0–P3`.
- Astra UX/producto/accesibilidad: `APPROVE — 0 P0–P3`; reproducción independiente
  en cuatro anchos y axe sin violaciones.

Fingerprint SHA256 de 21 archivos frontend:
`8301CC499708D355381154A750402AA57AB08C63456F00D03F5F68B0F730943E`.

Evidencia local ignorada por Git: `frontend/demo-playwright-report/results.json` y
`frontend/test-results/`, incluidas capturas `recovery-edit-focus.png`.

## Límites

No se implementan backend, Real, proveedor de pagos/reintegros, transportista,
facturación, homologación ni SC22. Stitch y el gate visual global permanecen abiertos;
esta evidencia certifica únicamente el corte ejecutable local SC21.
