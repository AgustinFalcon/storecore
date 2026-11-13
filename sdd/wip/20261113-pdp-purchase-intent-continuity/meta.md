# Metadata — continuidad de intención desde la ficha de producto

- Estado: `implementation`
- Fecha: 2026-11-13
- Modo: brownfield, StoreCore frontend y acceso unificado existente
- Prioridad: P2 funcional de experiencia comprador
- Dependencia: `20261113-cart-checkout-access-continuity` completado

## Alcance

Preservar en la misma pestaña la selección exacta de producto, variante y cantidad
cuando una persona anónima inicia el acceso desde la ficha. Después de obtener una
sesión CUSTOMER autoritativa, la aplicación vuelve a la ficha, relee producto y
carrito, restaura la selección exacta y exige una confirmación explícita antes de
usar el contrato existente de carrito.

No hay alta automática de líneas, suma implícita, persistencia cross-device ni
reutilización del challenge de acceso como almacenamiento comercial.
