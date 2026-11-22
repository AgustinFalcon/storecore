# Spec funcional — escenarios comerciales integrales de demostración

## Objetivo

Completar la demostración de Ferretería Falcon con un conjunto grande, sintético, repetible y auditable de ventas que alimente las vistas de comprador y administración sin inventar autoridad de pago ni depender de un proveedor externo.

## Escenarios requeridos

La carga conserva el comprador principal de catálogo y usa un comprador comercial separado con correo `.invalid`. Debe dejar exactamente:

1. un pedido pendiente de pago;
2. un pedido acreditado todavía sin preparar;
3. un pedido en preparación;
4. un pedido enviado con seguimiento;
5. un pedido entregado;
6. un retiro listo para retirar;
7. un retiro ya retirado;
8. una devolución recibida pendiente de clasificación;
9. una devolución cerrada con dos unidades: una repuesta y una dañada.

Cada acreditación recorre checkout real, proveedor oficial local, webhook firmado, inbox durable, refetch oficial y worker comercial. Los estados de envío y devolución se alcanzan mediante comandos productivos ordenados.

## Experiencia demostrable

- El comprador ve historial, detalle, totales, artículos, entrega y cronología coherentes.
- Administración ve ventas, ingresos, pagos pendientes, preparación, envíos, retiros, devoluciones y stock afectado.
- Overview muestra cifras exactas y colas coherentes; `READY_FOR_PICKUP` permanece activo y `PICKED_UP` no.
- El stock vendido se descuenta mediante reservas consumidas y ledger `SALE`; la devolución mixta repone exactamente una unidad.
- La segunda carga produce el mismo resultado sin duplicar pedidos, aplicaciones, eventos, reservas ni movimientos.

## Criterios de aceptación

- Nueve pedidos exactos y ocho aplicaciones comerciales acreditadas.
- Ocho pagos aprobados, ocho intentos acreditados y ocho reservas consumidas.
- Siete registros de envío: sin preparar, preparar, enviado, entregado, listo para retirar, retirado y retorno recibido/cerrado según el modelo productivo.
- Dos devoluciones y una disposición mixta confirmada.
- Conteos y miembros se verifican por claves estables, no sólo por presencia visual.
- Recibo sin cookies, contraseñas, tokens ni PII real.
- Evidencia rotulada `RealBackendLocalProvider`; nunca `RealBackend` proveedor-libre.

## Fuera de alcance

- Mercado Pago real, Mercado Libre, ARCA, Correo Argentino o BlackStore.
- Alterar guards productivos o escribir directamente estados `PAID`, pagos, reservas o ledger.
- Usar los datos sintéticos como migración productiva.
