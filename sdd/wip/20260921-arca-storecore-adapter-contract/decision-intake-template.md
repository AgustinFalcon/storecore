# Paquete de decisiones previo al adapter fiscal

**Estado:** plantilla preparada; ninguna respuesta cierra un gate hasta que su
dueño y aprobador queden registrados. No incluir CUIT, certificados, claves,
tokens ni datos de compradores: sólo referencias opacas y evidencia saneada.

## Encabezado obligatorio por decisión

1. ID del gate, decisión concreta, alcance, versión y vigencia.
2. Emisor/perfil/ambiente afectados, usando referencias saneadas.
3. Fuente normativa o técnica fechada y evidencia enlazada.
4. Reglas, excepciones y tratamiento fail-closed de datos faltantes/Unknown.
5. Dependencias, cuestiones pendientes y procedimiento de incidente/revisión.
6. Responsable operativo, aprobador por rol, fecha y versión aprobada.

## Titular y contador — D-02/D-03

- Emisor(es), régimen/condición vigente, domicilios aplicables, puntos de venta,
  ambientes, vigencia y responsables.
- Matriz por operación y receptor: comprobante permitido, identificación y
  condición fiscal, concepto, moneda/cotización, detalle o montos globales,
  neto/IVA/tributos/exento, descuentos, envío y redondeo.
- Tratamiento de pagos parciales, múltiples pagos, saldo y sobrepago.
- Conformidad explícita del titular y del contador sobre la misma versión.

## Plataforma y contador — D-04

- Servicio/protocolo que satisface la matriz, manual/WSDL/catálogos fechados,
  URLs por ambiente y checksum o referencia estable.
- Capacidades CAE/CAEA requeridas y funciones no soportadas.
- Evidencia separada de habilitación real del emisor; no se infiere desde la
  documentación pública.

## Producto y contador — D-05/SC-01

- Evento durable exacto que vuelve elegible una operación y precondiciones de
  verificación oficial.
- Fecha fiscal, zona horaria, momento de emisión, entrega, cambios posteriores,
  contingencia y responsable de revisión.
- Casos verificables de la política versionada. Redirect, retorno, webhook o
  pago aprobado aislados nunca son el trigger automático.

## Producto y contador — D-06/SC-05

- Matriz para cancelación, devolución parcial/total, refund, chargeback,
  diferencias y errores.
- Cuándo corresponde NC/ND o revisión, quién autoriza y vínculo exacto con el
  documento original, importes, tributos, fechas y auditoría.

## Plataforma, legal y compliance — SC-03/SC-04/SC-06

- Lane durable por emisor/ambiente/PV/tipo, reserva exacta, fencing, ownership,
  recovery e incertidumbre; más plan de pruebas post-GO.
- Catálogo/clasificación de datos, snapshot protegido, logs saneados, acceso,
  exportación, backup/restore y retención con fuente aprobada.
- PDF/HTML/QR desde documento autorizado, accesibilidad, canales, destinatarios,
  reintentos, evidencia de entrega y fallos.

## Plataforma — D-01/D-07/SC-02/SC-07

- ADR de ownership entre biblioteca, adapter StoreCore y pagos.
- Adopción explícita del contrato MP Orders para fiscal y evidencia wire
  representativa; los fakes no acreditan proveedor.
- Catálogo versionado de identidades fiscales, fórmulas, dominio de unicidad,
  parciales y correlaciones, sin reutilizar IDs de otros dominios.
- Frontera entre el lane comercial V4 y la intención/outbox fiscal: misma
  transacción o consumidor durable con cursor/dedupe/recovery propios.

## Gate de salida

No se abre WIP implementable mientras una respuesta pendiente pueda cambiar
obligación de emitir, comprobante, importe, fecha, destinatario, rectificación,
ownership o comportamiento ante incertidumbre. Tras aprobar el diseño se exige
un nuevo WIP, GO Sol y aceptación ejecutable; la homologación sigue separada.
