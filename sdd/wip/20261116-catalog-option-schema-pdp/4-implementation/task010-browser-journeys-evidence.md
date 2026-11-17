# TASK-010 — Browser journeys

Fecha de evidencia: 2026-11-17.

## Comprador

- Producto simple `Absent` con atributo descriptivo y una variante: cero selector
  redundante, continuación explícita, restauración de cantidad y un único PUT de
  carrito con SKU/cantidad exactos; la línea resultante se observa en `/cart`.
- Tres ejes no cartesianos: cambiar el primero limpia sólo el segundo incompatible,
  conserva el tercero compatible y retira SKU, precio, favorito y submit previos.
- La intención suspendida escribe `RETIRED`. Un documento nuevo same-origin recibe
  ese tab state, hidrata CUSTOMER/producto/carrito y no recupera confirmación ni
  emite escrituras. Otra acción explícita crea un flow distinto y sólo su
  confirmación publica al carrito.
- Los fixtures fallan ante cualquier request no-GET/HEAD fuera del PUT exacto de
  carrito, evitando que otro verbo quede oculto detrás de un 404.

## Administración y búsqueda

- El conflicto administrativo conserva borrador tras 409, relee revisión 8,
  exige elección y reaplicación explícitas, y no emite otro PUT antes de Guardar.
- El segundo PUT usa revisión 8, lleva la etiqueta local y conserva el orden de
  valores publicado por la otra sesión; la relectura se deriva de ese body.
- Público y admin transportan nombre, SKU secundario y categoría. La búsqueda
  literal de un SKU de variante inactiva queda vacía en público y visible en
  consola.

## Responsive y accesibilidad

- Estados con 0, 1, 2 y 4 ejes a 390, 768 y 1.440 px.
- Select, Swatch, teclado, labels largos, estados parciales y conflicto admin.
- Sin overflow horizontal y sin impactos Axe `serious` o `critical`.

## Gates

- Playwright focal exacto: 17/17, cuatro workers, cero retries.
- ESLint focal: PASS.
- Angular: 1.584/1.584 tests en 224 archivos.
- Build productivo: PASS; bundle inicial 698,02 kB raw / 166,34 kB estimado.
- GPT-6.1 Astra UX/Product: APPROVE, sin P0–P3.
- GPT-6.1 Sol técnico: APPROVE, sin P0–P3.

Las respuestas API de estos journeys son controladas por Playwright. La evidencia
PostgreSQL/API real pertenece a TASK-009. CI hosted, merge y post-merge permanecen
separados y no se declaran aquí.
