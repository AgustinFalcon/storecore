# SC-SURF-23 — Mercado Libre Demo

Base: `64c11f9ff7acb827a643b68d74acc7396b4a4a55`. Fecha: 2026-11-04.
Estado: implementación local verificada y aprobada; sin push, PR, merge, proveedor,
backend ni cambios Real.

## Alcance

Feature dedicada `/demo/user/mercadolibre` con cinco áreas: Cuenta, Publicaciones,
Sincronización, Actividad y Competencia. Mantiene 17 SKU, cuatro vínculos heredados,
cuenta desconectada y evidencia parcial sin inventar IDs, fechas, ACK o cuentas.

Cuenta/mapping/generación y las intenciones Stock, Price y Publication son tipos
cerrados e independientes. Stock captura vendible SC22; precio deseado no edita
Catálogo/ofertas; Publish/Pause sólo afecta intención local. Crear/enviar/retry no
confirma: únicamente “Simular resultado” aplica un outcome rotulado Demo.

Intentos, comandos y eventos validan destino, generación y procedencia. Retry sólo
después de rechazo. Eventos tardíos conocidos son Superseded; Unknown bloquea sin
efectos. Mapping tuple es único entre SKU y admite variación vacía. Remap/reconnect
fencea intentos anteriores; la revisión y el efecto deben usar la misma identidad.
Writer/CAS/readback, quota, dos pestañas y actor/epoch preservan borrador y obligan a
actualizar/revisar/reconfirmar.

El módulo pausado bloquea comandos dentro del dominio y UI. No se usan queueStock,
processStock, mlSale, red, proveedor ni webhook. Real permanece GET-only. Competencia
es informativa: sin SKU/evidencia/costo/piso muestra No evaluable y no ofrece repricing.

## Experiencia

Todos los SKU son alcanzables con paginación y filtros URL correlacionados. Ausencia de
asociación se distingue de registro Unknown. Precio local, deseado y observado no se
mezclan. Reviews muestran cuenta, destino, tipo, valor, generación e impacto de
supersession. Loading, empty, no-results, access denied, Unknown, conflicto y recovery
están cubiertos.

Tabla/tarjetas/columna pasan 1440/768/390/320, texto 200 %, tabs con teclado, foco,
trap, Escape, axe y ausencia de overflow.

## Gates

- Verify: **826 tests PASS**, arquitectura **6/6**, lint y builds Real/Demo PASS.
- Focales SC23: **47/47 PASS**.
- Browser amplio previo: **125/125 PASS** sobre `613cac…`; browser dirigido final
  del último guard: **29/29 PASS** sobre el fingerprint definitivo.
- CTA: **665/665** observadas/ejecutadas, 0 pendientes; 222 IDs estáticos.
- Astra dominio/seguridad: `APPROVE — 0 P0–P3`.
- Astra UX/producto/accesibilidad: `APPROVE — 0 P0–P3`.

Fingerprint SHA256 de 20 fuentes:
`5d71f7c44856f87b80efdefa52a89f859e939d65afed9f83c446c37f15c409a4`.

Evidencia externa:
`outputs/sc23-frontend-final-20261104/final-unknown-tuple-*`.

## Límites

No implementa integración ML real, OAuth, webhooks, catálogo remoto, competencia real,
repricing, backend ni homologación. Stitch y gate visual global siguen abiertos.
