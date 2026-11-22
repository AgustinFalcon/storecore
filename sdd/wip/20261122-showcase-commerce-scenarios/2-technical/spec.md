# Spec técnico — DATA-04

## Arquitectura

El corte agrega un coordinador local separado del loader V3 de catálogo. Sus pasos son objetos con una sola responsabilidad: preflight, identidad, checkout, acreditación, fulfillment, devolución, readback y recibo. El coordinador sólo los ordena.

Los conjuntos finitos se modelan como tipos cerrados con un único `fromWire`: `ScenarioKind`, `DeliveryMode`, `ShipmentTarget`, `ReturnTarget` y `ReplayDecision`. Valores desconocidos fallan antes del primer HTTP.

## Autoridad

Por cada escenario acreditado:

1. registra o reutiliza un comprador sintético;
2. agrega SKU y cantidad al carrito mediante API;
3. ejecuta `/api/v1/customer/checkout` con idempotency key estable;
4. el adapter oficial crea la orden en el proveedor loopback;
5. el proveedor acredita y persiste su estado en un journal atómico;
6. el loader envía webhook HMAC firmado;
7. espera inbox procesado y `mp_order_commercial_applications`;
8. verifica pago, intento, aplicación, reserva consumida y ledger antes de continuar.

El proveedor local persiste `orders` e idempotency claims en JSON versionado. La misma clave y el mismo hash reusan respuesta; la misma clave con payload distinto devuelve conflicto. Escritura temporal + rename evita journal parcial.

## Replay

- Namespace fijo: `ferreteria-falcon-commerce-v1`.
- Cada escenario tiene clave estable y se descubre por `checkout_idempotency_key`/referencia externa.
- Un escenario completo se verifica y no se muta.
- Un escenario parcial sólo reanuda desde evidencia durable válida.
- La intención se persiste antes de mutar el carrito; una reanudación sólo adopta un único renglón que coincida exactamente en SKU y cantidad.
- Evidencia contradictoria aborta todo el run; no se repara con SQL directo.
- Datos ajenos al namespace se preservan.

## Runtime aislado

- Base PostgreSQL descartable y loopback únicamente.
- Backend empaquetado al SHA actual, Angular producción y Chromium.
- Proveedor fijo en `127.0.0.1:4302`, secretos locales efímeros y sin credenciales live.
- El runner gestiona sus procesos y elimina únicamente sus reglas/temporales.

## Verificación exacta

El recibo y los tests afirman por claves estables:

- nueve pedidos y distribución de estados;
- ocho grafos de autoridad completos;
- ocho movimientos `SALE`, reservas `CONSUMED` y cantidades exactas;
- seis estados de envío operativos más el pedido acreditado sin envío;
- dos devoluciones, una disposición confirmada y delta de stock `+1` por `RMA_RESTOCK`;
- overview TODAY/7/30, colas y exclusión de terminales;
- historial y detalle comprador; listado, detalle y acciones admin;
- replay con cero filas nuevas y recibo idéntico.
- replay con huella de autoridad SQL idéntica antes y después, además del recibo idéntico.

## Seguridad

No se aceptan URLs o puertos configurables fuera de loopback. El journal no contiene secretos. Los comandos SQL de verificación son sólo lectura. Ningún script de showcase se incluye en el artefacto productivo ni habilita endpoints de fixture en Spring.
