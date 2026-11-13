# Progreso — continuidad de intención desde la ficha de producto

## 2026-11-13

- Auditoría coordinada funcional/técnica: GO con alcance frontend-only.
- Hallazgo P1 descartado por diseño: no autoagregar porque el PUT actual es SET y
  no existe un contrato durable exactamente-una-vez.
- Decisión comercial: conservar SET y explicar `cantidad actual → cantidad final`.
- Decisión de seguridad: storage same-tab 15 minutos, referencia opaca, sin URL ni
  datos de autoridad/precio/stock.
- Decisión UX: relectura fresca, restauración exacta y confirmación explícita; sin
  fallback a primera variante.
- Estado: specs listos para revisión coordinada.
- Primera revisión coordinada: sin P0/P1; cuatro P2 documentales sobre outcome
  ambiguo, separación aceptación/refresh/clear, TTL+revisión al confirmar y
  ownership Angular/salidas de acceso.
- Specs corregidos con resultados cerrados, tombstone best-effort, política común
  de continuación y tests de carreras/fallos posteriores. Estado: re-review.
- Segunda revisión coordinada GPT-6.1 Sol: APPROVE funcional y APPROVE técnico;
  sin P0-P3 restantes. Estado: implementación autorizada.
- Implementados tipos cerrados, wire fail-closed, storage por pestaña, tombstone
  best-effort, coordinator, policy de salida CUSTOMER y pasos de captura,
  restauración, revisión, confirmación y outcome ambiguo.
- Login, challenge, sesiones existentes y registro propagan exclusivamente el
  flowId validado; USER y CART/CHECKOUT conservan sus destinos autoritativos.
- PDP restaura solo variante exacta, relee producto/carrito mediante snapshots
  atómicos, conserva el DOM/foco al corregir y explica cantidad actual→final.
- CartStore separa resultado de PUT de publicación de una lectura concurrente;
  solo 4xx probado es rechazo y transporte/parse/mapping queda OutcomeUnknown.
- Reviews iterativas corrigieron scope root, fallos invisibles de storage,
  reconciliación CSRF, generación GET/PUT, SKU canónico, lecturas fallidas y el
  borrador de cantidad. Dictamen final funcional/UX y técnico/seguridad: APPROVE,
  sin P0-P3.
- Evidencia focal final: integración padre/vista, acceso, dominio, storage,
  coordinator, PDP y carrito verdes.
- Gate frontend completo: arquitectura y lint verdes; 203 archivos / 1380 pruebas
  verdes; build de producción verde.
- Estado: listo para PR y CI.
