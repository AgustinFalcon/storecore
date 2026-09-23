# Sol review — Mercado Pago live checkout

**Fecha:** 2026-09-22  
**WIP:** `20260922-storecore-mp-live-checkout-v1`

## Dictamen

GO documental como WIP de descubrimiento. NO-GO para implementar con doubles, agregar DDL/secretos o activar pagos reales.

La documentación ya exige validar origen, forma, tópico e IDs según el contrato oficial antes del inbox procesable; persistir antes del ACK; tratar el retorno del navegador sólo como UX; distinguir identidad de notificación y recurso; y aplicar estado, evento y outbox atómicamente. Refund/chargeback y su relación con orden, RMA, fulfillment y stock permanecen decisiones abiertas.

## Gates para código

1. Elegir el producto Mercado Pago y conservar fuentes oficiales fechadas de creación, notificación y consulta.
2. Mapear IDs de notificación, tópico, evento y recurso, más autenticación y dedupe del producto elegido.
3. Cerrar la máquina de estados, incluidos pagos parciales, fuera de orden, refund y chargeback.
4. Dar GO específico de Sol al contrato implementable y sus tareas.

Credenciales reales pertenecen al gate posterior de sandbox/E2E; no son requisito para código con doubles una vez cerrado el contrato.
