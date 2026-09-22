# Revisión de readiness — integración fiscal StoreCore

**Fecha:** 2026-09-22  
**Estado:** `NO-GO para código fiscal`; preparación documental vigente.

## Alcance revisado

Se contrastó el contrato fiscal WIP con la implementación actual de pagos y capabilities. Esta revisión no incorpora DDL, endpoints, workers, secretos, perfiles fiscales ni llamadas a ARCA.

## Hallazgos verificables

1. `JdbcPaymentService.notify` persiste una notificación en `payment_event_inbox` y deduplica por `(provider, provider_event_id)`, pero no verifica `x-signature`, no consulta el recurso oficial de Mercado Pago ni determina un pago/orden confirmado.
2. El mismo servicio no crea `payment_event_applications`, no cambia una orden/pago y no produce un evento de negocio verificado. Por lo tanto, su respuesta `accepted` significa únicamente recepción durable, no cobro acreditado.
3. El schema actual sólo habilita `PAYMENTS_MP`; la lista cerrada de `capability_modules` no contiene `FISCAL` y la configuración de capabilities admite únicamente `{}`. Esto protege correctamente contra introducir una configuración fiscal o secreto de forma implícita, pero exige un WIP y migración aprobados antes de crear la capability fiscal.
4. `integration_outbox` está ligado a una entrada Mercado Pago y el contrato fiscal prohíbe reutilizarlo por inferencia. La salida fiscal requerirá ownership/atomicidad explícitos en SC-07.
5. La biblioteca externa candidata publica módulos `com.agusstkd.arca:core`, `:wsaa`, `:wsfev1` y `:renderer-pdf` en `0.1.0-RC.4`; incluye WSAA, WSFEv1, PDF y notas de crédito/débito. Es candidata técnica, no una autorización de emisión.
6. `TASK-006` figura como `complete` en el plan canónico, pero los puntos 1 y 2 no alcanzan su criterio de aceptación de webhook oficial, replay, aplicación y outbox. Hasta corregir o revisar esa evidencia, la tarea no puede actuar como dependencia satisfecha de un disparador fiscal.

## Caso inicial propuesto (pendiente de aprobación fiscal)

- Emisor: monotributista de la instalación, configurado fuera del código y por referencia opaca a secreto.
- Comprobante objetivo: Factura C para consumidor final.
- Cliente: datos mínimos fiscales capturados como snapshot de la venta; ninguna pantalla fuerza Factura A.
- Rectificación: un comprobante autorizado nunca se borra ni se edita. Devoluciones o contracargos pasan a revisión y sólo pueden derivar en nota de crédito/débito asociada cuando la política fiscal aprobada lo indique.
- Operación: PDF autorizado disponible para administrador y comprador únicamente si la política y el requisito de producto lo habilitan.

Este caso reduce el primer alcance, pero no reemplaza la confirmación del punto de venta, fecha fiscal, tratamiento de pagos parciales ni aprobación de titular/contador.

## Secuencia para abrir el WIP implementable

1. Terminar TASK-006 de pagos: validar webhook HMAC, persistir antes de efectos, refetch del recurso oficial, correlación con orden/pago y aplicación idempotente.
2. Registrar D-02 y D-03: punto de venta, domicilio a mostrar, vigencia y matriz mínima Factura C/consumidor final, aprobada por titular o contador.
3. Cerrar D-04/D-07 con fuentes fechadas: manual/WSDL ARCA elegido y producto/recurso Mercado Pago realmente usado por StoreCore.
4. Aprobar SC-01..SC-07: política de elegibilidad, claves, serialización, modelo/retención, rectificativos, representación y ownership del outbox.
5. Obtener GO específico de Sol y recién entonces crear el WIP de implementación, su modelo físico y su adapter contra una versión publicada de la biblioteca.

## Datos mínimos que debe confirmar el emisor de prueba

- Punto de venta habilitado para factura electrónica.
- Domicilio fiscal que debe mostrarse.
- Que continúa activo como monotributista.

No se solicitan certificados, claves privadas, tokens o credenciales hasta la etapa de homologación autorizada.
