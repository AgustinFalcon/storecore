# Sol GO acotado — MP-LIVE-02A

**Fecha:** 2026-09-22  
**WIP:** `sdd/wip/20260922-storecore-mp-live-checkout-v1/`  
**Tarea:** `3-tasks/mp-live-02a-pure-logic.md`

## Dictamen

**GO específico sólo para política Kotlin pura en `commerce/domain` y tests unitarios en memoria.** La referencia, UUID, tiempo/ventana, límites y acreditación financiera entran como snapshots explícitos; las decisiones son inmutables y no ejecutan efectos. `CREATED` es intento activo y cualquier acreditación financiera previa bloquea otro intento, incluso con orden `PAID_STOCK_REVIEW`.

**NO-GO** para DDL/SQL, rutas HTTP, SDK/red, secretos, webhook/worker, inventario, órdenes/pagos `PAID`, outbox, fiscal, wiring al checkout o activación de capabilities. MP-LIVE-03/04/05 y pagos reales permanecen bloqueados; el WIP sigue `documented_deferred`.

Condición de cierre de MP-LIVE-02A: tests en memoria para idempotencia, intentos simultáneos representados por snapshot, estados activos, errores ambiguos, búsqueda cero/uno/múltiples, ventana/paginación y bind repetido/conflictivo; luego revisión Sol del código. El GO no declara aprobado ese código antes de la revisión posterior.
