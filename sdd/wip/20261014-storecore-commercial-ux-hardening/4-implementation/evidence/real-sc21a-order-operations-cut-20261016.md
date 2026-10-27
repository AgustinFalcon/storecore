# SC21A Real — pedidos y operación de entrega
> **Procedencia:** evidencia histórica de un árbol de integración previo al split. El
> SHA exacto no es recuperable (`UNKNOWN/UNVERIFIED`); por tanto, estos resultados
> no certifican el PR #195 ni `master`. Consultar `historical-provenance.md` y
> repetir todos los gates sobre el SHA dueño antes de promover el corte.

Fecha: 2026-10-16
Alcance: cola administrativa `/user/orders`, detalle `/user/orders/:id` y contrato mínimo de tracking del backend.

## Resultado implementado

- Cola profesional con búsqueda por pedido/SKU, filtros cerrados, cantidad de resultados, estados autoritativos, total y presentación móvil en tarjetas.
- Detalle `Pedido #…` con SKU, cantidad, precio original, descuento, precio aplicado, subtotal, total y hechos independientes de pedido/pago/entrega/devolución.
- Confirmación modal obligatoria para cada transición. RMA informa alcance de pedido completo y que no repone stock ni devuelve dinero.
- Tracking se envía únicamente en `SHIPPED`; `PACKED` y `DELIVERED` rechazan un valor propuesto. `DELIVERED` conserva el tracking almacenado cuando existe y admite entrega sin tracking.
- Fases cerradas `Idle / Submitting / Reconciling / Confirmed / Failed / Unknown`, feedback visible y una sola solicitud POST por intención.
- Lecturas de reconciliación con generación compartida y contador de lecturas: una respuesta vieja no escribe ni libera acciones mientras otra lectura autoritativa continúa.
- Cambio de actor borra filtros, propuestas, tracking privado y estado de las stores.
- Specs SDD corregidos: el contrato Real RMA sólo implementa `RECEIVED`; inspección y ajuste no se simulan.

## Evidencia automatizada

- Arquitectura: **6/6 PASS** (`Container → View → Store → UseCase → HTTP repository`).
- ESLint: **PASS**.
- Unitarias completas: **136 archivos / 590 tests PASS**.
- Focalizadas SC21A: **8 archivos / 45 tests PASS**, incluidos ambos órdenes de respuesta de lecturas concurrentes.
- Build producción final: **PASS**, `666.58 kB` raw / `148.50 kB` transferencia estimada.
- Backend: `FulfillmentCommandTest` **PASS** con Maven.
- Browser Chromium: **3/3 PASS** a `390 / 768 / 1440`; sin overflow horizontal, foco inicial/restaurado con Escape, Axe sin violaciones serious/critical y cero requests inesperados.
- Servidor Angular temporal y Chromium finalizaron al cerrar la suite.

## Reviews coordinadas Astra

- Bugbot: **APPROVE**, 0 P1/P2.
- Security: **APPROVE**, 0 P1/P2.
- UX/Product: **APPROVE**, 0 P1/P2 en revisión estática; los P3 visuales de foco y responsive fueron luego cubiertos por Playwright 3/3.

## Límites explícitos

- No se implementaron etiquetas, facturación, reembolsos, inspección/ajuste RMA, incidentes ni devolución parcial.
- `READY_PICKUP` no se produce ni avanza con el backend productivo actual.
- Este corte no cierra SC21B ni el gate de diseño integral SC20/22/23/24/25/26.
- No se creó commit, PR, merge ni publicación.
