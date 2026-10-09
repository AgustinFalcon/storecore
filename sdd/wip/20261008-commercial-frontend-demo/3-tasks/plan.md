# Plan D/B/T/U/E

La B significa base de comportamiento frontend demo; no depende de desarrollar backend. Implementación en cortes revisables sobre #182; ningún cherry-pick del candidato FE04 backend.

1. DEMO-D: contrato, inventario inicial y review documental. Reconciliar acciones reales antes de declarar alcance completo.
2. DEMO-B: composición, seed/store transaccional, repositorios demo, clock/ids, persistencia/reset y pruebas de aislamiento/idempotencia.
3. DEMO-T: reutilizar tipos existentes, completar traductores y viewmodels; tests Unknown, dinero y flujos conectados. Puede prepararse en paralelo con B; integración exige ambos.
4. DEMO-U1: tienda/customer/checkout completos y responsive. DEMO-U2 en paralelo: admin, contenido/catálogo/promos/pedidos/inventario/ML/configuración. No editar shell compartido simultáneamente: ownership por corte y sincronización explícita.
5. DEMO-E: inventario final contra DOM; escenarios Playwright; axe, keyboard, screenshots y review diseño independiente; regresión HTTP/UA y producción. Corregir y repetir pruebas afectadas hasta aprobar.

Gates: E01 bootstrap/reset/aislamiento; E02 catálogo/PDP/cart; E03 checkout aprobado/pendiente/rechazado/retry/falta stock; E04 identidad/customer; E05 admin CRUD y storefront actualizado; E06 stock/pedido/fulfillment coherentes; E07 ML/inteligencia simulados e idempotencia; E08 todos CTA y rutas/responsive/a11y; E09 regresión HTTP/auth y build producción; E10 review independiente sin P1/P2 abierto.

Cada PR declara base/SHA, alcance y evidencia; no confundir CI verde con cobertura total. El cierre exige cero CTA sin resultado verificable, cero placeholders no inventariados y cero errores de consola inesperados. Funciones externas simuladas permanecen identificadas en el handoff y pendientes para backend/homologación. El plan no autoriza merge a master, release ni deploy.
