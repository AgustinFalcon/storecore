# Metadata — continuidad de intención desde la ficha de producto

- Estado: `completed`
- Fecha: 2026-11-13
- Modo: brownfield, StoreCore frontend y acceso unificado existente
- Prioridad: P2 funcional de experiencia comprador
- Dependencia: `20261113-cart-checkout-access-continuity` completado
- Autoridad: PR #267, merge `c0595e54b175009758b8940024115c024dd21215`
- Validación: Verify PR `43522541468` y post-merge `43523386759`, 3/3 verdes

## Alcance

Preservar en la misma pestaña la selección exacta de producto, variante y cantidad
cuando una persona anónima inicia el acceso desde la ficha. Después de obtener una
sesión CUSTOMER autoritativa, la aplicación vuelve a la ficha, relee producto y
carrito, restaura la selección exacta y exige una confirmación explícita antes de
usar el contrato existente de carrito.

No hay alta automática de líneas, suma implícita, persistencia cross-device ni
reutilización del challenge de acceso como almacenamiento comercial.
