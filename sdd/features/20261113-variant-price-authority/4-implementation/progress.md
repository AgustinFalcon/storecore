# Progreso — autoridad de precio por variante

## 2026-11-13

- Auditoría coordinada confirmó un gap transversal: base de datos, catálogo,
  PDP, favoritos y carrito siguen usando el precio padre.
- Un parche solo visual fue clasificado P1 porque permitiría mostrar un importe y
  cobrar otro.
- Se preserva la semántica vigente de ofertas fijas con tope en la base resuelta.
- Checkout conserva snapshots históricos; repricing queda en un SDD separado.
- Estado: specs preparados para review funcional y técnica coordinada.
- Primera review detectó un P1 de autoridad: reutilizar `CatalogProduct.price` en
  el editor podía copiar un override del SKU sobre `products.base_price`.
- Specs corregidos: `productBasePrice` separado, policy de lectura distinta del
  comando, wire legacy fail-closed y presentación Desde ligada a su SKU y oferta.
- Segunda revisión coordinada GPT-6.1 Sol: APPROVE funcional/producto/UX y
  APPROVE técnico/seguridad; sin P0-P3. Implementación autorizada.
- Implementada V21 con override nullable por SKU, tipos cerrados de política,
  comando y resolución, y una autoridad compartida por catálogo, PDP,
  favoritos, carrito y snapshots de orden/pago/Mercado Pago.
- El frontend separa precio padre y precio propio, presenta Exact/Desde/Unknown
  y bloquea compra o persistencia cuando la autoridad no es válida.
- La revisión final encontró y cerró dos defectos de borde: redondeo silencioso
  de lexemas monetarios y una etiqueta falsa de “sin oferta” ante cotización
  desconocida. El draft conserva ahora texto crudo y monto validado por separado.
- Evidencia focal: 19/19 unitarias frontend; Playwright 2/2 con escritura
  secuencial, PUT exacto y cero PUT ante escala inválida; recuperación Flyway
  14/14; `git diff --check` sin errores.
- Tercera revisión coordinada funcional/producto/UX y técnico/seguridad:
  APPROVE, sin P0-P3.
- Gate frontend completo: arquitectura y lint verdes, 204 archivos/1386 tests
  verdes y build productivo exitoso.
- Gate backend completo: 424 tests verdes, incluidas migraciones V1→V21,
  contratos HTTP, carrito, órdenes, pagos y recuperación.
- El smoke de creación detectó una carrera real de edición rápida: el hijo podía
  emitir contra un `draft` anterior antes del repintado del padre. El editor
  conserva ahora el último borrador emitido; prueba focal 8/8 y Playwright 2/2.
- PR #269 fusionado en `master` como `7053e8f`. Verify del PR `43534342235` y
  post-merge `43535120746`: backend, frontend y E2E real 3/3 verdes.
- SDD cerrado con 12/12 tareas completas.
